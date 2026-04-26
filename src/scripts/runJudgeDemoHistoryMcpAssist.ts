import dotenv from "dotenv";

import { db } from "../db";
import * as schema from "../db/schema";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import { runPropertyHistoryReplay } from "../engine/pipelines/PropertyHistoryRunner";
import { CaseAssistOrchestrator } from "../engine/services/CaseAssistOrchestrator";
import { CaseLifecycleService } from "../engine/services/CaseLifecycleService";
import { createMcpTools } from "../mcp/server";
import type { EmbeddingClient } from "../services/semanticIndex";

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
	const replay = await runPropertyHistoryReplay({
		dayRootPath: "testfiles/HistoryPopulationData",
		runDay: async ({ datasetRootPath, noisyInputFiles }) => {
			const preloadedExistingFacts = await preloadExistingGoldFacts(PROPERTY_ID);
			return runBaselineDryRun({
				db,
				propertyId: PROPERTY_ID,
				datasetRootPath,
				includeCoreIngestions: false,
				noisyInputFiles,
				preloadedExistingFacts,
				embeddingClient,
				gatekeeper: { isRelevant: async () => true },
				extractor: {
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
				},
				caseExtractor: {
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
				},
			});
		},
	});

	const tools = createMcpTools(db as never, { embeddingClient });
	const semanticSearch = tools.find((tool) => tool.name === "semantic_search");
	const getRelatedCases = tools.find((tool) => tool.name === "get_related_cases");
	const getRelatedFacts = tools.find((tool) => tool.name === "get_related_facts");
	const getCaseContextBundle = tools.find(
		(tool) => tool.name === "get_case_context_bundle",
	);
	if (
		!semanticSearch ||
		!getRelatedCases ||
		!getRelatedFacts ||
		!getCaseContextBundle
	) {
		throw new Error("Epic 4 MCP tools are not available.");
	}

	const assistCase = await ensureDemoAssistCase();
	if (!assistCase) {
		throw new Error("Unable to resolve assist case for demo output.");
	}
	const lifecycle = new CaseLifecycleService(db);
	const orchestrator = new CaseAssistOrchestrator(db, lifecycle, { embeddingClient });

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
	const queryThree = await getCaseContextBundle.execute({
		caseId: assistCase.id,
		relatedCasesLimit: 3,
		relatedFactsLimit: 3,
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

	await db.insert(schema.sources).values({
		id: "demo-assist-source",
		fileId: "demo-assist-invoice.pdf",
		fileType: "pdf",
		ingestionDate: new Date().toISOString(),
	}).onConflictDoNothing();
	await db.insert(schema.facts).values({
		id: "demo-assist-fact",
		propertyId: PROPERTY_ID,
		category: "financial",
		key: "invoice_paid",
		value: "paid",
		sourceId: "demo-assist-source",
		isGoldStandard: false,
		confidenceScore: 0.96,
	}).onConflictDoNothing();
	await db.insert(schema.factHouses).values({
		factId: "demo-assist-fact",
		houseId: "LIE-001-H1",
	}).onConflictDoNothing();
	await db.insert(schema.factApartments).values({
		factId: "demo-assist-fact",
		apartmentId: "LIE-001-H1-A1",
	}).onConflictDoNothing();

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

	console.log("=== JUDGE DEMO: HISTORY + MCP + GUARDED CASE ASSIST ===");
	console.log(
		`History replay: days=${replay.totalDaysProcessed} facts=${replay.totals.factsPersisted} cases_opened=${replay.totals.casesOpened} cases_resolved=${replay.totals.casesResolved}`,
	);
	console.log("MCP query snapshots:");
	console.log(
		`1) semantic_search results=${Array.isArray(queryOne) ? queryOne.length : 0}`,
	);
	console.log(
		`2) get_related_cases results=${Array.isArray(queryTwo) ? queryTwo.length : 0}`,
	);
	console.log(
		`3) get_case_context_bundle caseId=${(queryThree as { case?: { id?: string } }).case?.id ?? "n/a"}`,
	);
	console.log("Case assist trace:");
	console.log(
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
	);
}

runJudgeDemoHistoryMcpAssist().catch((error) => {
	console.error("Epic 4 demo script failed", error);
	process.exit(1);
});
