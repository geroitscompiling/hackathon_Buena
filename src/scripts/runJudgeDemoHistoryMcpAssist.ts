import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../db";
import * as schema from "../db/schema";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import { runPropertyHistoryReplay } from "../engine/pipelines/PropertyHistoryRunner";
import { CaseAssistOrchestrator } from "../engine/services/CaseAssistOrchestrator";
import { CaseLifecycleService } from "../engine/services/CaseLifecycleService";
import { createMcpTools } from "../mcp/server";
import type { EmbeddingClient } from "../services/semanticIndex";
import type { JudgeDemoMode } from "./judgeDemoRunner";
import { runJudgeDemoRunner } from "./judgeDemoRunner";
import { getServerEnv } from "../env";

dotenv.config({ path: [".env.local", ".env"] });

const PROPERTY_ID = "LIE-001";

function vectorForText(text: string): number[] {
	const lower = text.toLowerCase();
	const a =
		(lower.includes("window") ? 0.8 : 0.1) +
		(lower.includes("repair") ? 0.2 : 0) +
		(lower.includes("invoice") ? 0.3 : 0);
	const b =
		(lower.includes("case") ? 0.5 : 0.1) +
		(lower.includes("follow") ? 0.3 : 0) +
		(lower.includes("paid") ? 0.3 : 0);
	return [a, b, ...Array.from({ length: 1534 }, () => 0)];
}

const embeddingClient: EmbeddingClient = {
	embedDocument: async (text) => vectorForText(text),
	embedQuery: async (text) => vectorForText(text),
};

function vectorOf(a: number, b = 0): number[] {
	return [a, b, ...Array.from({ length: 1534 }, () => 0)];
}

async function preloadExistingGoldFacts(propertyId: string) {
	const existingFacts = await db.query.facts.findMany({
		where: (factsTable, { and, eq }) =>
			and(eq(factsTable.propertyId, propertyId), eq(factsTable.isGoldStandard, true)),
		with: {
			houseLinks: true,
			apartmentLinks: true,
		},
	});

	return existingFacts.map((fact) => {
		const apartmentId = fact.apartmentLinks[0]?.apartmentId;
		const houseId = fact.houseLinks[0]?.houseId;
		const scopeType = apartmentId ? "apartment" : houseId ? "house" : "property";
		return {
			id: fact.id,
			scope: {
				scopeType,
				propertyId: fact.propertyId,
				houseId,
				apartmentId,
			} as const,
			category: fact.category,
			key: fact.key,
			value: fact.value,
			sourceId: fact.sourceId,
			isGoldStandard: fact.isGoldStandard,
		};
	});
}

async function ensureDemoAssistCase() {
	const candidate = await db.query.cases.findFirst({
		where: (cases, { and, eq, ne, isNotNull }) =>
			and(
				eq(cases.propertyId, PROPERTY_ID),
				ne(cases.status, "resolved"),
				isNotNull(cases.closurePredicate),
			),
	});
	if (candidate) {
		return candidate;
	}

	const now = new Date().toISOString();
	await db.insert(schema.users).values({
		id: "user-1",
		name: "Default Owner",
		email: "owner@buena.test",
	}).onConflictDoNothing();
	await db.insert(schema.cases).values({
		id: "demo-assist-case",
		propertyId: PROPERTY_ID,
		houseId: "LIE-001-H1",
		apartmentId: "LIE-001-H1-A1",
		ownerUserId: "user-1",
		caseKey: "a:LIE-001-H1-A1|epic4demo|invoice-followup",
		closurePredicate: "invoice_paid",
		title: "Invoice follow-up demo",
		summary: "Demo assist closure case",
		status: "open",
		createdAt: now,
		updatedAt: now,
	});
	return await db.query.cases.findFirst({
		where: (cases, { eq }) => eq(cases.id, "demo-assist-case"),
	});
}

async function runJudgeDemoHistoryMcpAssist(): Promise<void> {
	const mode = ((process.env.HISTORY_MODE ?? "mock").trim().toLowerCase() ||
		"mock") as JudgeDemoMode;
	if (mode !== "mock" && mode !== "live") {
		throw new Error(`Unsupported HISTORY_MODE "${mode}"`);
	}
	const artifactRoot = path.resolve("artifacts");
	const traceArtifactPath = path.join(artifactRoot, "judge-demo-case-assist-trace.json");
	const conflictLogPath = path.join(artifactRoot, "history-conflicts.jsonl");

	const result = await runJudgeDemoRunner({
		mode,
		artifactRoot,
		dependencies: {
			ensureDbReady: async () => {
				try {
					await db.execute("select 1");
				} catch (cause) {
					const error = new Error("Database is unavailable");
					(error as { code?: string; cause?: unknown }).code = "DB_UNAVAILABLE";
					(error as { cause?: unknown }).cause = cause;
					throw error;
				}
				if (mode === "live") {
					try {
						getServerEnv();
					} catch (cause) {
						const error = new Error("Missing GEMINI environment configuration");
						(error as { code?: string; cause?: unknown }).code =
							"MISSING_ENV_CONFIG";
						(error as { cause?: unknown }).cause = cause;
						throw error;
					}
				}
			},
			replayHistory: async () => {
				const replay = await runPropertyHistoryReplay({
					dayRootPath: "testfiles/HistoryPopulationData",
					dayFilter: process.env.HISTORY_DAY ?? process.env.DAY ?? undefined,
					runDay: async ({ datasetRootPath, noisyInputFiles }) => {
						const preloadedExistingFacts =
							await preloadExistingGoldFacts(PROPERTY_ID);
						return runBaselineDryRun({
							db,
							propertyId: PROPERTY_ID,
							datasetRootPath,
							includeCoreIngestions: false,
							noisyInputFiles,
							preloadedExistingFacts,
							embeddingClient,
							gatekeeper: mode === "mock" ? { isRelevant: async () => true } : undefined,
							extractor:
								mode === "mock"
									? {
											extract: async (documentText) => {
												if (!documentText.includes("Subject:")) {
													return [];
												}
												return [
													{
														category: "maintenance",
														key: "window_issue",
														value: "LIE-001-H1-A1",
														confidenceScore: 0.9,
													},
												];
											},
									  }
									: undefined,
							caseExtractor:
								mode === "mock"
									? {
											extract: async (documentText) => {
												if (!documentText.includes("Subject:")) {
													return [];
												}
												return [
													{
														title: "Window repair batch",
														summary: "Tracked from deterministic demo run",
														status: "open",
														scopeHint: "apartment",
														primarySignal: "windowtrack",
														closurePredicate: "repair_completed",
														confidence: 0.9,
													},
												];
											},
									  }
									: undefined,
							maxCasesPerRun: mode === "mock" ? 1 : undefined,
							onConflict: async (entry) => {
								await mkdir(path.dirname(conflictLogPath), { recursive: true });
								await writeFile(
									conflictLogPath,
									`${JSON.stringify(entry)}\n`,
									{ flag: "a", encoding: "utf8" },
								);
							},
						});
					},
				});
				return {
					totalDaysProcessed: replay.totalDaysProcessed,
					totals: replay.totals,
					conflictLogPath,
				};
			},
			runCanonicalQueries: async () => {
				const tools = createMcpTools(db as never, { embeddingClient });
				const semanticSearch = tools.find((tool) => tool.name === "semantic_search");
				const getRelatedCases = tools.find(
					(tool) => tool.name === "get_related_cases",
				);
				const getRelatedFacts = tools.find(
					(tool) => tool.name === "get_related_facts",
				);
				const getCaseContextBundle = tools.find(
					(tool) => tool.name === "get_case_context_bundle",
				);
				if (
					!semanticSearch ||
					!getRelatedCases ||
					!getRelatedFacts ||
					!getCaseContextBundle
				) {
					const error = new Error("Required MCP tools are not available");
					(error as { code?: string }).code = "MCP_TOOL_FAILURE";
					throw error;
				}
				const assistCase = await ensureDemoAssistCase();
				if (!assistCase) {
					const error = new Error("Unable to resolve assist case for demo output.");
					(error as { code?: string }).code = "MCP_TOOL_FAILURE";
					throw error;
				}
				try {
					const queryOne = await semanticSearch.execute({
						query: "window issue in LIE-001-H1-A1",
						entityType: "all",
						propertyId: PROPERTY_ID,
						limit: 3,
					});
					const queryTwo = await getRelatedCases.execute({
						caseId: assistCase.id,
						limit: 3,
					});
					const queryThree = await getRelatedFacts.execute({
						caseId: assistCase.id,
						limit: 3,
					});
					const queryFour = await getCaseContextBundle.execute({
						caseId: assistCase.id,
						relatedCasesLimit: 3,
						relatedFactsLimit: 3,
					});
					return {
						snapshots: [
							{
								tool: "semantic_search",
								hitCount: Array.isArray(queryOne) ? queryOne.length : 0,
								topHitIds: Array.isArray(queryOne)
									? queryOne
											.map((row) =>
												typeof row === "object" &&
												row !== null &&
												"id" in row &&
												typeof (row as { id?: unknown }).id === "string"
													? (row as { id: string }).id
													: null,
											)
											.filter((id): id is string => id !== null)
											.slice(0, 3)
									: [],
							},
							{
								tool: "get_related_cases",
								hitCount: Array.isArray(queryTwo) ? queryTwo.length : 0,
								topHitIds: [],
							},
							{
								tool: "get_related_facts",
								hitCount: Array.isArray(queryThree) ? queryThree.length : 0,
								topHitIds: [],
							},
							{
								tool: "get_case_context_bundle",
								hitCount:
									typeof queryFour === "object" && queryFour !== null ? 1 : 0,
								topHitIds: [],
							},
						],
					};
				} catch (cause) {
					const error = new Error("MCP query execution failed");
					(error as { code?: string; cause?: unknown }).code = "MCP_TOOL_FAILURE";
					(error as { cause?: unknown }).cause = cause;
					throw error;
				}
			},
			runGuardedAssist: async () => {
				const assistCase = await ensureDemoAssistCase();
				if (!assistCase) {
					throw new Error("Unable to resolve assist case for guardrail scenario");
				}
				const lifecycle = new CaseLifecycleService(db);
				const orchestrator = new CaseAssistOrchestrator(db, lifecycle, {
					embeddingClient,
				});
				const rejected = await lifecycle.evaluateGuardedClosureAction({
					caseId: assistCase.id,
					propertyId: PROPERTY_ID,
					proposedAction: "close_case",
					proposedConfidence: 0.5,
					confidenceThreshold: 0.8,
					nowIso: new Date().toISOString(),
					contextSummary: "demo guardrail low-confidence rejection",
				});
				await db
					.insert(schema.sources)
					.values({
						id: "demo-assist-source",
						fileId: "demo-assist-invoice.pdf",
						fileType: "pdf",
						ingestionDate: new Date().toISOString(),
					})
					.onConflictDoNothing();
				await db
					.insert(schema.facts)
					.values({
						id: "demo-assist-fact",
						propertyId: PROPERTY_ID,
						category: "financial",
						key: "invoice_paid",
						value: "paid",
						sourceId: "demo-assist-source",
						isGoldStandard: false,
						confidenceScore: 0.96,
						embedding: vectorOf(1),
					})
					.onConflictDoNothing();
				await db
					.insert(schema.factHouses)
					.values({
						factId: "demo-assist-fact",
						houseId: "LIE-001-H1",
					})
					.onConflictDoNothing();
				await db
					.insert(schema.factApartments)
					.values({
						factId: "demo-assist-fact",
						apartmentId: "LIE-001-H1-A1",
					})
					.onConflictDoNothing();
				const accepted = await lifecycle.evaluateGuardedClosureAction({
					caseId: assistCase.id,
					propertyId: PROPERTY_ID,
					proposedAction: "close_case",
					proposedConfidence: 0.92,
					confidenceThreshold: 0.8,
					nowIso: new Date().toISOString(),
					contextSummary: "demo guardrail approval with invoice evidence",
				});
				const traces = await db.query.caseActionTraces.findMany({
					where: (trace, { eq }) => eq(trace.caseId, assistCase.id),
				});
				const assistBundle = await orchestrator.run({
					caseId: assistCase.id,
					propertyId: PROPERTY_ID,
					confidenceThreshold: 0.8,
					nowIso: new Date().toISOString(),
				});
				await mkdir(path.dirname(traceArtifactPath), { recursive: true });
				await writeFile(
					traceArtifactPath,
					JSON.stringify(
						{
							caseId: assistCase.id,
							rejected,
							accepted,
							orchestratedRecommendation: assistBundle.recommendation,
							orchestratedGuardrailResult: assistBundle.guardrailResult,
							traceReasons: traces.map((trace) => trace.reason),
							traceEvidence: traces.map((trace) => trace.evidenceFactIds),
						},
						null,
						2,
					),
					"utf8",
				);
				return {
					approved: accepted.closed ? 1 : 0,
					rejected: rejected.closed ? 0 : 1,
					traceArtifactPath,
				};
			},
		},
	});
	process.exit(result.exitCode);
}

runJudgeDemoHistoryMcpAssist().catch((error) => {
	console.error("Epic 4 demo script failed", error);
	process.exit(1);
});
