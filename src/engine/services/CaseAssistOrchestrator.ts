import type { db as appDb } from "#/db";
import { createMcpTools, listMcpTools } from "#/mcp/server";
import type { EmbeddingClient } from "#/services/semanticIndex";
import { CaseAgentRuntime } from "./CaseAgentRuntime";
import type { CaseLifecycleService, GuardedClosureResult } from "./CaseLifecycleService";

type CaseAssistDb = typeof appDb;

type CaseContextBundle = {
	case: {
		id: string;
		closurePredicate?: string | null;
	};
	relatedCases: unknown[];
	relatedFacts: Array<{
		payload?: {
			key?: string;
			value?: string;
		};
	}>;
};

export type CaseAssistRecommendation = {
	proposedAction: "close_case" | "keep_open";
	confidence: number;
	why: string;
};

export type CaseAssistRunResult = {
	bundle: CaseContextBundle;
	recommendation: CaseAssistRecommendation;
	guardrailResult?: GuardedClosureResult;
};

function createLocalMcpClient(
	database: CaseAssistDb,
	options: { embeddingClient?: EmbeddingClient } = {},
) {
	const tools = createMcpTools(database as never, {
		embeddingClient: options.embeddingClient,
	});

	return {
		connect: async () => {},
		listTools: async () => ({
			tools: listMcpTools(tools).map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			})),
		}),
		callTool: async ({
			name,
			arguments: args,
		}: {
			name: string;
			arguments: Record<string, unknown>;
		}) => {
			const matched = tools.find((tool) => tool.name === name);
			if (!matched) {
				return {
					isError: true,
					content: [{ type: "text", text: `Tool not found: ${name}` }],
				};
			}
			const result = await matched.execute(args);
			return {
				isError: false,
				structuredContent: result,
				content: [{ type: "text", text: JSON.stringify(result) }],
			};
		},
		close: async () => {},
	};
}

export class CaseAssistOrchestrator {
	constructor(
		private readonly db: CaseAssistDb,
		private readonly lifecycle: Pick<CaseLifecycleService, "evaluateGuardedClosureAction">,
		private readonly options: {
			embeddingClient?: EmbeddingClient;
			baseUrl?: string;
		} = {},
	) {}

	async run(input: {
		caseId: string;
		propertyId: string;
		confidenceThreshold: number;
		nowIso: string;
	}): Promise<CaseAssistRunResult> {
		const runtime = new CaseAgentRuntime(this.db, this.lifecycle, {
				baseUrl: this.options.baseUrl,
				now: () => input.nowIso,
				createMcpClient: this.options.baseUrl
					? undefined
					: async () => createLocalMcpClient(this.db, this.options),
		});

		const result = await runtime.run(input);
		const debugBundle = result.debugBundle as CaseContextBundle | undefined;
		const bundle =
			debugBundle?.case?.id
				? debugBundle
				: {
				case: { id: input.caseId },
				relatedCases: [],
				relatedFacts: [],
			};

		return {
			bundle,
			recommendation: {
				proposedAction: result.recommendation.proposedAction,
				confidence: result.recommendation.confidence,
				why: result.recommendation.summary,
			},
			guardrailResult: result.guardrailResult,
		};
	}
}
