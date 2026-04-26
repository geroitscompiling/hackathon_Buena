import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
	generateText,
	jsonSchema,
	stepCountIs,
	tool,
	type ToolSet,
} from "ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getGeminiServiceRuntimeEnv } from "#/env";
import * as schema from "#/db/schema";
import type { AppDatabase } from "#/services/database";
import {
	appendAgentRunMessage,
	appendAgentRunToolCall,
	completeAgentRun,
	createAgentRun,
	type AgentRecommendation,
} from "#/services/agentRuns";
import { TERMINAL_CASE_STATUS } from "../case/caseDomain";
import type { GuardedClosureResult, CaseLifecycleService } from "./CaseLifecycleService";

type McpListToolsResult = {
	tools: Array<{
		name: string;
		description?: string;
		inputSchema?: unknown;
	}>;
};

type McpCallToolResult = {
	content?: Array<{ type?: string; text?: string }>;
	isError?: boolean;
	structuredContent?: unknown;
};

type McpClient = {
	connect: () => Promise<void>;
	listTools: () => Promise<McpListToolsResult>;
	callTool: (args: { name: string; arguments: Record<string, unknown> }) => Promise<McpCallToolResult>;
	close: () => Promise<void>;
};

type RuntimeTranscriptMessage = {
	role: "assistant";
	content: string;
};

type ToolObservation = {
	toolName: string;
	toolArguments: Record<string, unknown>;
	result: unknown;
};

type InvestigationContinueDecision = {
	status: "continue";
	assistantMessage: string;
	toolName: string;
	toolArguments: Record<string, unknown>;
};

type InvestigationDoneDecision = {
	status: "done";
	assistantMessage: string;
	recommendation: AgentRecommendation;
};

type InvestigationDecision =
	| InvestigationContinueDecision
	| InvestigationDoneDecision;

type BaselineCaseContext = {
	case: typeof schema.cases.$inferSelect & {
		property: typeof schema.properties.$inferSelect;
		house: typeof schema.houses.$inferSelect | null;
		apartment: typeof schema.apartments.$inferSelect | null;
		owner: typeof schema.users.$inferSelect;
	};
	linkedFacts: Array<{
		id: string;
		category: string;
		key: string;
		value: string;
		isGoldStandard: boolean;
		confidenceScore: number;
		source: {
			id: string;
			fileId: string;
			fileType: string;
			ingestionDate: string;
			documentDate: string | null;
		};
	}>;
};

type InvestigationPolicyInput = {
	baselineContext: BaselineCaseContext;
	availableToolNames: Set<string>;
	observations: ToolObservation[];
	decision: InvestigationDecision;
};

const recommendationSchema = z.object({
	proposedAction: z.enum(["close_case", "keep_open"]),
	confidence: z.number().min(0).max(1),
	summary: z.string().min(1),
	evidenceFactIds: z.array(z.string()),
});

const SYSTEM_PROMPT = [
	"You are a property-management case assistant.",
	"You will receive the current case and its directly linked evidence in the prompt.",
	"Treat that baseline context as authoritative current state.",
	"Use available MCP tools to explore scoped history, link evidence, update the case, and request guarded closure when justified.",
	"Work like a persistent investigation agent: inspect evidence, decide the next best tool call, observe results, and continue until you reach a justified conclusion or exhaust meaningful leads.",
	"Do not stop after a single inconclusive lookup if relevant tools remain unused.",
	"If the case concerns rent, invoices, payments, warnings, arrears, or proof of payment, use the read-only testfiles tools to inspect raw source files such as bank statements or letters when other evidence is insufficient.",
	"Return a conservative recommendation.",
	"Do not invent evidence. If evidence is weak or absent after investigation, keep the case open.",
	"Write all assistant outputs in English, including the final recommendation summary and any narrative before the final JSON.",
].join(" ");

const DEFAULT_MAX_AGENT_STEPS = 50;

async function buildBaselineContext(
	database: AppDatabase,
	caseId: string,
): Promise<BaselineCaseContext> {
	const caseRow = await database.query.cases.findFirst({
		where: (cases, { eq: equals }) => equals(cases.id, caseId),
		with: {
			apartment: true,
			house: true,
			owner: true,
			property: true,
		},
	});

	if (!caseRow) {
		throw new Error(`Case not found: ${caseId}`);
	}

	const factLinks = await database.query.factCases.findMany({
		where: (factCases, { eq: equals }) => equals(factCases.caseId, caseId),
		with: {
			fact: {
				with: {
					source: true,
				},
			},
		},
	});

	return {
		case: caseRow,
		linkedFacts: factLinks.map((link) => ({
			id: link.fact.id,
			category: link.fact.category,
			key: link.fact.key,
			value: link.fact.value,
			isGoldStandard: link.fact.isGoldStandard,
			confidenceScore: link.fact.confidenceScore,
			source: {
				id: link.fact.source.id,
				fileId: link.fact.source.fileId,
				fileType: link.fact.source.fileType,
				ingestionDate: link.fact.source.ingestionDate,
				documentDate: link.fact.source.documentDate,
			},
		})),
	};
}

function parseToolPayload(result: McpCallToolResult): unknown {
	if (typeof result.structuredContent !== "undefined") {
		return result.structuredContent;
	}

	const text = result.content
		?.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text ?? "")
		.join("")
		.trim();

	if (!text) {
		return null;
	}

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function stripVectorFields(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripVectorFields);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !["embedding", "embeddings", "vector", "vectors"].includes(key.toLowerCase()))
				.map(([key, nested]) => [key, stripVectorFields(nested)]),
		);
	}

	return value;
}

function summarizeForPrompt(value: unknown, maxLength = 8000) {
	const serialized = JSON.stringify(stripVectorFields(value) ?? {}, null, 2);
	if (serialized.length <= maxLength) {
		return serialized;
	}
	return `${serialized.slice(0, maxLength)}\n...[truncated]`;
}

function parseRecommendationFromText(text: string): AgentRecommendation {
	const trimmed = text.trim();
	const fencedJson = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const objectJson = trimmed.match(/\{[\s\S]*\}/)?.[0];
	const jsonText = fencedJson ?? objectJson ?? trimmed;
	const parsed = JSON.parse(jsonText) as Record<string, unknown>;
	if (typeof parsed.proposedAction === "string") {
		const normalizedAction = parsed.proposedAction
			.trim()
			.replace(/([a-z])([A-Z])/g, "$1_$2")
			.toLowerCase()
			.replace(/[\s-]+/g, "_");
		if (
			["close", "closecase", "close_case", "closed", "request_case_closure"].includes(
				normalizedAction,
			)
		) {
			parsed.proposedAction = "close_case";
		}
		if (
			["keepopen", "keep_open", "open", "remain_open"].includes(
				normalizedAction,
			)
		) {
			parsed.proposedAction = "keep_open";
		}
	}
	try {
		return recommendationSchema.parse(parsed);
	} catch (error) {
		throw new Error(
			`Invalid final case recommendation: ${JSON.stringify(parsed)}`,
			{ cause: error },
		);
	}
}

function caseText(context: BaselineCaseContext) {
	return [
		context.case.title,
		context.case.summary,
		context.case.caseKey,
		context.case.closurePredicate ?? "",
		...context.linkedFacts.flatMap((fact) => [fact.key, fact.value, fact.source.fileId]),
	]
		.filter(Boolean)
		.join(" ");
}

function isPaymentSensitiveCase(context: BaselineCaseContext) {
	return /\b(rent|invoice|payment|paid|warning|arrears|mahnung|bank|eh-\d+)\b/i.test(
		caseText(context),
	);
}

function hasToolObservation(observations: ToolObservation[], toolName: string) {
	return observations.some((observation) => observation.toolName === toolName);
}

function hasAnyTestfilesResearch(observations: ToolObservation[]) {
	return observations.some((observation) =>
		observation.toolName.endsWith("_testfiles") ||
		observation.toolName.includes("testfiles"),
	);
}

function pickPaymentResearchQuery(context: BaselineCaseContext) {
	const text = caseText(context);
	const quotedNameMatch = text.match(/\b[A-Z][a-z]+ [A-ZÄÖÜ][a-zäöüß]+\b/u);
	if (quotedNameMatch) {
		return quotedNameMatch[0];
	}

	const unitMatch = text.match(/\bEH-\d+\b/i);
	if (unitMatch) {
		return unitMatch[0];
	}

	const invoiceMatch = text.match(/\bINV-[A-Z0-9-]+\b/i);
	if (invoiceMatch) {
		return invoiceMatch[0];
	}

	return null;
}

function buildForcedInvestigationDecision(
	input: InvestigationPolicyInput,
): InvestigationContinueDecision | null {
	if (input.decision.status !== "done") {
		return null;
	}

	if (input.decision.recommendation.proposedAction !== "keep_open") {
		return null;
	}

	if (
		input.availableToolNames.has("get_case_closure_evidence") &&
		!hasToolObservation(input.observations, "get_case_closure_evidence")
	) {
		return {
			status: "continue",
			assistantMessage: "I need to check scoped closure evidence before keeping the case open.",
			toolName: "get_case_closure_evidence",
			toolArguments: {
				caseId: input.baselineContext.case.id,
				limit: 10,
			},
		};
	}

	if (
		input.availableToolNames.has("search_case_history") &&
		!hasToolObservation(input.observations, "search_case_history")
	) {
		return {
			status: "continue",
			assistantMessage: "I need to check scoped case history before keeping the case open.",
			toolName: "search_case_history",
			toolArguments: {
				caseId: input.baselineContext.case.id,
				limit: 5,
			},
		};
	}

	if (
		isPaymentSensitiveCase(input.baselineContext) &&
		!hasAnyTestfilesResearch(input.observations)
	) {
		const paymentQuery = pickPaymentResearchQuery(input.baselineContext);
		if (paymentQuery && input.availableToolNames.has("grep_testfiles")) {
			return {
				status: "continue",
				assistantMessage: "I need to inspect the raw payment files before keeping this payment case open.",
				toolName: "grep_testfiles",
				toolArguments: {
					relativePath: "bank/kontoauszug_2024_2025.csv",
					query: paymentQuery,
					limit: 20,
				},
			};
		}

		if (input.availableToolNames.has("list_testfiles_directory")) {
			return {
				status: "continue",
				assistantMessage: "I need to inspect the available raw payment files before keeping this payment case open.",
				toolName: "list_testfiles_directory",
				toolArguments: {
					relativePath: "bank",
					limit: 50,
				},
			};
		}
	}

	return null;
}

async function lookupLatestTraceId(
	database: AppDatabase,
	caseId: string,
): Promise<string | undefined> {
	const trace = await database.query.caseActionTraces.findFirst({
		where: eq(schema.caseActionTraces.caseId, caseId),
		orderBy: [desc(schema.caseActionTraces.createdAt)],
	});

	return trace?.id;
}

async function createDefaultMcpClient(baseUrl: string): Promise<McpClient> {
	const transport = new StreamableHTTPClientTransport(
		new URL("/api/mcp", baseUrl),
	);
	const client = new Client({
		name: "buena-case-agent",
		version: "1.0.0",
	});

	return {
		connect: async () => {
			await client.connect(transport);
		},
		listTools: async () => client.listTools({}),
		callTool: async (args) => client.callTool(args),
		close: async () => {
			await transport.terminateSession();
			await client.close();
		},
	};
}

function normalizeGoogleModelId(modelId: string) {
	return modelId.replace(/^google\//, "");
}

function createAiSdkMcpTools(input: {
	availableTools: McpListToolsResult["tools"];
	toolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
	observations: ToolObservation[];
}): ToolSet {
	return Object.fromEntries(
		input.availableTools.map((toolDef) => {
			const inputSchema =
				toolDef.inputSchema ?? {
					type: "object",
					additionalProperties: true,
				};

			return [
				toolDef.name,
				tool({
					description: toolDef.description ?? `MCP tool ${toolDef.name}`,
					inputSchema: jsonSchema(inputSchema as never),
					execute: async (args) => {
						const toolArguments =
							args && typeof args === "object"
								? (args as Record<string, unknown>)
								: {};
						const result = await input.toolCall(toolDef.name, toolArguments);
						input.observations.push({
							toolName: toolDef.name,
							toolArguments,
							result: stripVectorFields(result),
						});
						return result;
					},
				}),
			];
		}),
	);
}

function buildNativeAgentPrompt(input: {
	caseId: string;
	propertyId: string;
	baselineContext: BaselineCaseContext;
	observations: ToolObservation[];
	maxSteps: number;
}) {
	return [
		`Investigate case ${input.caseId} for property ${input.propertyId}.`,
		`You may use up to ${input.maxSteps} tool-loop steps.`,
		"Current case context and directly linked evidence are provided below as baseline context; do not call tools to rediscover that baseline.",
		"Use MCP tools only for higher-value work: scoped history, related facts/cases, raw testfiles research, linking evidence, updating the case, and requesting guarded closure.",
		"Before deciding keep_open for a case with possible closure or payment evidence, check multiple relevant sources when available instead of stopping after the first inconclusive result.",
		"If the case involves rent, invoices, arrears, warnings, or proof of payment, inspect raw source files in testfiles using the read-only file tools when needed.",
		"Do not repeat the same tool call with the same arguments unless you have a specific new reason.",
		"If closure is justified, prefer request_case_closure so the guarded lifecycle boundary records the decision.",
		"Return the final structured recommendation only when the investigation is complete.",
		'Final response must be one JSON object with proposedAction exactly "close_case" or "keep_open", confidence, summary, and evidenceFactIds. Do not wrap it in markdown.',
		"The summary field must be English even when evidence or source files are in another language.",
		`Baseline context:\n${summarizeForPrompt(input.baselineContext)}`,
		input.observations.length > 0
			? `Additional forced observations already gathered:\n${summarizeForPrompt(input.observations)}`
			: "Additional forced observations already gathered:\n[]",
		"If you finish, include only fact IDs that directly support closure in evidenceFactIds.",
	].join("\n\n");
}

export class CaseAgentRuntime {
	constructor(
		private readonly db: AppDatabase,
		private readonly lifecycle: Pick<CaseLifecycleService, "evaluateGuardedClosureAction">,
		private readonly options: {
			modelId?: string;
			baseUrl?: string;
			now?: () => string;
			createMcpClient?: (baseUrl: string) => Promise<McpClient>;
			maxInvestigationSteps?: number;
			planInvestigationStep?: (input: {
				caseId: string;
				propertyId: string;
				baselineContext: BaselineCaseContext;
				availableTools: McpListToolsResult["tools"];
				observations: ToolObservation[];
				stepNumber: number;
				maxSteps: number;
			}) => Promise<InvestigationDecision>;
			generateRecommendation?: (input: {
				caseId: string;
				propertyId: string;
				baselineContext: BaselineCaseContext;
				toolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
			}) => Promise<{
				transcript: RuntimeTranscriptMessage[];
				recommendation: AgentRecommendation;
				debugBundle?: unknown;
			}>;
		} = {},
	) {}

	private now(): string {
		return this.options.now?.() ?? new Date().toISOString();
	}

	async run(input: {
		caseId: string;
		propertyId: string;
		confidenceThreshold: number;
		nowIso?: string;
	}): Promise<{
		runId: string;
		recommendation: AgentRecommendation;
		guardrailResult?: GuardedClosureResult;
		transcript: Array<{ role: "user" | "system" | "assistant" | "tool"; content: string }>;
		debugBundle?: unknown;
	}> {
		const nowIso = input.nowIso ?? this.now();
		const modelId = this.options.modelId ?? "gemini-2.5-flash";
		const baseUrl = this.options.baseUrl ?? "http://127.0.0.1:3000";
		const run = await createAgentRun(this.db, {
			caseId: input.caseId,
			model: `google/${modelId}`,
			startedAt: nowIso,
		});

		const transcript: Array<{
			role: "user" | "system" | "assistant" | "tool";
			content: string;
		}> = [];
		let stepIndex = 0;
		const baselineContext = await buildBaselineContext(this.db, input.caseId);
		let closureRequestOutcome: GuardedClosureResult | undefined;
		const maxInvestigationSteps =
			this.options.maxInvestigationSteps ?? DEFAULT_MAX_AGENT_STEPS;

		const persistMessage = async (
			role: "user" | "system" | "assistant" | "tool",
			content: string,
		) => {
			transcript.push({ role, content });
			await appendAgentRunMessage(this.db, {
				agentRunId: run.id,
				stepIndex: stepIndex++,
				role,
				content,
				createdAt: this.now(),
			});
		};

		const mcpClientFactory = this.options.createMcpClient ?? createDefaultMcpClient;
		const client = await mcpClientFactory(baseUrl);

		try {
			await persistMessage("system", SYSTEM_PROMPT);
			const userPrompt = [
				`Review case ${input.caseId} for property ${input.propertyId}.`,
				"Baseline case context:",
				JSON.stringify(baselineContext, null, 2),
			].join("\n\n");
			await persistMessage("user", userPrompt);

			let recommendation: AgentRecommendation;
			let debugBundle: unknown;

			if (baselineContext.case.status === TERMINAL_CASE_STATUS) {
				recommendation = {
					proposedAction: "close_case",
					confidence: 1,
					summary: "Case is already resolved.",
					evidenceFactIds: [],
				};
				debugBundle = { skippedBecauseTerminal: true };
				await persistMessage("assistant", recommendation.summary);
			} else {
				await client.connect();
				const availableTools = await client.listTools();
			const availableToolNames = new Set(
				availableTools.tools.map((tool) => tool.name),
			);
			const observations: ToolObservation[] = [];

			const toolCall = async (
				toolName: string,
				args: Record<string, unknown>,
			): Promise<unknown> => {
				const startedAt = this.now();
				const result = await client.callTool({
					name: toolName,
					arguments: args,
				});
				const finishedAt = this.now();
				const parsedPayload = parseToolPayload(result);
				if (toolName === "request_case_closure" && parsedPayload && typeof parsedPayload === "object") {
					const payload = parsedPayload as { result?: GuardedClosureResult };
					if (payload.result) {
						closureRequestOutcome = payload.result;
					}
				}

				if (result.isError) {
					await appendAgentRunToolCall(this.db, {
						agentRunId: run.id,
						stepIndex,
						toolName,
						arguments: args,
						result: parsedPayload,
						status: "failed",
						error: "MCP tool call failed",
						startedAt,
						finishedAt,
						createdAt: startedAt,
					});
					throw new Error("MCP tool call failed");
				}

				await appendAgentRunToolCall(this.db, {
					agentRunId: run.id,
					stepIndex,
					toolName,
					arguments: args,
					result: parsedPayload,
					status: "completed",
					startedAt,
					finishedAt,
					createdAt: startedAt,
				});
				await persistMessage("tool", JSON.stringify({ toolName, result: parsedPayload }));
				return parsedPayload;
			};

			if (this.options.generateRecommendation) {
				const outcome = await this.options.generateRecommendation({
					caseId: input.caseId,
					propertyId: input.propertyId,
					baselineContext,
					toolCall,
				});

				for (const message of outcome.transcript) {
					await persistMessage(message.role, message.content);
				}
				recommendation = outcome.recommendation;
				debugBundle = outcome.debugBundle;
			} else if (!this.options.planInvestigationStep) {
				const runtimeEnv = getGeminiServiceRuntimeEnv();
				const provider = createGoogleGenerativeAI({
					apiKey: runtimeEnv.GEMINI_API_KEY,
				});
				const tools = createAiSdkMcpTools({
					availableTools: availableTools.tools,
					toolCall,
					observations,
				});
				const result = await generateText({
					model: provider(normalizeGoogleModelId(modelId)),
					system: SYSTEM_PROMPT,
					prompt: buildNativeAgentPrompt({
						caseId: input.caseId,
						propertyId: input.propertyId,
						baselineContext,
						observations,
						maxSteps: maxInvestigationSteps,
					}),
					temperature: 0,
					tools,
					stopWhen: stepCountIs(maxInvestigationSteps),
				});

				recommendation = parseRecommendationFromText(result.text);
				debugBundle = {
					steps: result.steps.length,
					toolCalls: observations,
				};
				await persistMessage(
					"assistant",
					recommendation.summary || result.text || JSON.stringify(recommendation),
				);
			} else {
				const planner =
					this.options.planInvestigationStep;

				let completionDecision: InvestigationDoneDecision | null = null;
				for (let investigationStep = 1; investigationStep <= maxInvestigationSteps; investigationStep += 1) {
					const plannedDecision = await planner({
						caseId: input.caseId,
						propertyId: input.propertyId,
						baselineContext,
						availableTools: availableTools.tools,
						observations,
						stepNumber: investigationStep,
						maxSteps: maxInvestigationSteps,
					});
					const decision =
						buildForcedInvestigationDecision({
							baselineContext,
							availableToolNames,
							observations,
							decision: plannedDecision,
						}) ?? plannedDecision;
					await persistMessage("assistant", decision.assistantMessage);

					if (decision.status === "done") {
						completionDecision = decision;
						break;
					}

					if (!availableToolNames.has(decision.toolName)) {
						throw new Error(`Planner selected unavailable tool: ${decision.toolName}`);
					}

					const toolResult = await toolCall(
						decision.toolName,
						decision.toolArguments,
					);
					observations.push({
						toolName: decision.toolName,
						toolArguments: decision.toolArguments,
						result: stripVectorFields(toolResult),
					});
				}

				if (!completionDecision) {
					const exhaustedSummary =
						observations.length > 0
							? `Investigation exhausted after checking ${observations
									.map((observation) => observation.toolName)
									.join(", ")} without reliable closure evidence.`
							: "Investigation exhausted without reliable closure evidence.";
					await persistMessage("assistant", exhaustedSummary);
					completionDecision = {
						status: "done",
						assistantMessage: exhaustedSummary,
						recommendation: {
							proposedAction: "keep_open",
							confidence: 0.4,
							summary: exhaustedSummary,
							evidenceFactIds: [],
						},
					};
				}

				recommendation = completionDecision.recommendation;
				debugBundle = observations;
			}
			}

			let guardrailResult: GuardedClosureResult | undefined;
			let guardrailTraceId: string | undefined;

			if (recommendation.proposedAction === "close_case" && !closureRequestOutcome) {
				guardrailResult = await this.lifecycle.evaluateGuardedClosureAction({
					caseId: input.caseId,
					propertyId: input.propertyId,
					proposedAction: "close_case",
					proposedConfidence: recommendation.confidence,
					confidenceThreshold: input.confidenceThreshold,
					nowIso,
					contextSummary: recommendation.summary,
				});
				guardrailTraceId = await lookupLatestTraceId(this.db, input.caseId);
			} else if (closureRequestOutcome) {
				guardrailResult = closureRequestOutcome;
				guardrailTraceId = await lookupLatestTraceId(this.db, input.caseId);
			}

			await completeAgentRun(this.db, {
				agentRunId: run.id,
				status: "completed",
				finalRecommendation: recommendation,
				guardrailTraceId,
				finishedAt: this.now(),
			});

			return {
				runId: run.id,
				recommendation,
				guardrailResult,
				transcript,
				debugBundle,
			};
		} catch (error) {
			await completeAgentRun(this.db, {
				agentRunId: run.id,
				status: "failed",
				finishedAt: this.now(),
			});
			throw error;
		} finally {
			await client.close();
		}
	}
}
