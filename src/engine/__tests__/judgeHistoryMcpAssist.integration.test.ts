import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import { runBaselineDryRun } from "#/engine/pipelines/BaselineDryRunPipeline";
import { CaseAssistOrchestrator } from "#/engine/services/CaseAssistOrchestrator";
import { CaseLifecycleService } from "#/engine/services/CaseLifecycleService";
import { createMcpTools } from "#/mcp/server";
import type { EmbeddingClient } from "#/services/semanticIndex";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

function vectorForText(text: string): number[] {
	const lower = text.toLowerCase();
	const a =
		(lower.includes("window") ? 0.8 : 0) +
		(lower.includes("repair") ? 0.2 : 0) +
		(lower.includes("invoice_paid") ? 0.1 : 0);
	const b =
		(lower.includes("case") ? 0.5 : 0.1) +
		(lower.includes("follow") ? 0.4 : 0) +
		(lower.includes("paid") ? 0.2 : 0);
	return [a || 0.01, b || 0.01, ...Array.from({ length: 1534 }, () => 0)];
}

function deterministicEmbeddingClient(): EmbeddingClient {
	return {
		embedDocument: async (text) => vectorForText(text),
		embedQuery: async (text) => vectorForText(text),
	};
}

async function createDatasetRoot() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "e4-mcp-workflow-"));
	await fs.mkdir(path.join(root, "emails"), { recursive: true });
	await fs.writeFile(
		path.join(root, "emails", "day-01.eml"),
		"Subject: Window issue\nBody: apartment LIE-001-H1-A1 window repair pending.\n",
		"utf8",
	);
	await fs.writeFile(
		path.join(root, "emails", "day-02.eml"),
		"Subject: Window follow-up\nBody: apartment LIE-001-H1-A1 vendor scheduled.\n",
		"utf8",
	);
	return root;
}

describe("judge history + MCP assist workflow (E4.6)", () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })),
		);
	});

	it("covers ingest -> MCP semantic retrieval -> context bundle -> guarded reject and close", async () => {
		const testDb = await createPostgresTestDb();
		const db = testDb.db;
		const datasetRoot = await createDatasetRoot();
		tempRoots.push(datasetRoot);

		try {
			await db.insert(schema.properties).values({
				id: "LIE-001",
				name: "Immanuelkirchstrasse 26",
			});
			await db.insert(schema.houses).values({
				id: "LIE-001-H1",
				propertyId: "LIE-001",
				name: "Front House",
			});
			await db.insert(schema.apartments).values({
				id: "LIE-001-H1-A1",
				houseId: "LIE-001-H1",
				name: "Unit 1",
			});

			const gatekeeper: RelevanceGatekeeper = { isRelevant: async () => true };
			const extractor: BuildingFactExtractor = {
				extract: async (documentText) => {
					if (documentText.includes("window")) {
						return [
							{
								category: "maintenance",
								key: "window_issue",
								value: "LIE-001-H1-A1",
								confidenceScore: 0.92,
							},
						];
					}
					return [];
				},
			};
			const caseExtractor = {
				extract: async (documentText: string) => [
					{
						title: "Window repair follow-up",
						summary: documentText.includes("follow-up")
							? "Vendor has been scheduled."
							: "Tenant reported stuck window.",
						status: documentText.includes("follow-up") ? ("in_progress" as const) : ("open" as const),
						scopeHint: "apartment" as const,
						primarySignal: "window-track",
						closurePredicate: "invoice_paid" as const,
						confidence: 0.91,
					},
				],
			};
			const embeddingClient = deterministicEmbeddingClient();

			const first = await runBaselineDryRun({
				db,
				propertyId: "LIE-001",
				datasetRootPath: datasetRoot,
				includeCoreIngestions: false,
				noisyInputFiles: ["emails/day-01.eml"],
				gatekeeper,
				extractor,
				caseExtractor,
				embeddingClient,
			});
			const second = await runBaselineDryRun({
				db,
				propertyId: "LIE-001",
				datasetRootPath: datasetRoot,
				includeCoreIngestions: false,
				noisyInputFiles: ["emails/day-02.eml"],
				gatekeeper,
				extractor,
				caseExtractor,
				embeddingClient,
			});

			expect(first.casesOpened).toBeGreaterThanOrEqual(1);
			expect(second.casesUpdated).toBeGreaterThanOrEqual(1);

			const caseRow = await db.query.cases.findFirst({
				where: (cases, { eq }) => eq(cases.propertyId, "LIE-001"),
			});
			expect(caseRow).toBeDefined();
			if (!caseRow) {
				throw new Error("Expected case row");
			}

			const tools = createMcpTools(db as never, { embeddingClient });
			const semanticSearchTool = tools.find((tool) => tool.name === "semantic_search");
			const relatedCasesTool = tools.find((tool) => tool.name === "get_related_cases");
			const relatedFactsTool = tools.find((tool) => tool.name === "get_related_facts");
			const bundleTool = tools.find((tool) => tool.name === "get_case_context_bundle");
			expect(semanticSearchTool && relatedCasesTool && relatedFactsTool && bundleTool).toBeTruthy();
			if (!semanticSearchTool || !relatedCasesTool || !relatedFactsTool || !bundleTool) {
				throw new Error("Expected Epic 4 MCP tools");
			}

			const semanticResults = (await semanticSearchTool.execute({
				query: "window repair follow up in unit one",
				entityType: "all",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				limit: 5,
			})) as Array<{ entityType: string }>;
			expect(semanticResults.length).toBeGreaterThan(0);
			expect(semanticResults.some((row) => row.entityType === "case")).toBe(true);

			const relatedCases = (await relatedCasesTool.execute({
				caseId: caseRow.id,
				limit: 3,
			})) as unknown[];
			const relatedFacts = (await relatedFactsTool.execute({
				caseId: caseRow.id,
				limit: 3,
			})) as unknown[];
			const contextBundle = (await bundleTool.execute({
				caseId: caseRow.id,
				relatedCasesLimit: 3,
				relatedFactsLimit: 3,
			})) as {
				case: { id: string };
				relatedCases: unknown[];
				relatedFacts: unknown[];
			};
			expect(Array.isArray(relatedCases)).toBe(true);
			expect(Array.isArray(relatedFacts)).toBe(true);
			expect(contextBundle.case.id).toBe(caseRow.id);
			expect(Array.isArray(contextBundle.relatedCases)).toBe(true);
			expect(Array.isArray(contextBundle.relatedFacts)).toBe(true);

			const lifecycle = new CaseLifecycleService(db);
			const rejected = await lifecycle.evaluateGuardedClosureAction({
				caseId: caseRow.id,
				propertyId: "LIE-001",
				proposedAction: "close_case",
				proposedConfidence: 0.4,
				confidenceThreshold: 0.8,
				nowIso: "2026-04-26T09:00:00.000Z",
				contextSummary: "agent suggested close with weak confidence",
			});
			expect(rejected).toEqual({
				closed: false,
				reason: "confidence_below_threshold",
			});

			const statusAfterReject = await db.query.cases.findFirst({
				where: (cases, { eq }) => eq(cases.id, caseRow.id),
			});
			expect(statusAfterReject?.status).not.toBe("resolved");

			await db.insert(schema.sources).values({
				id: "e4-closure-source",
				fileId: "invoice-day-03.pdf",
				fileType: "pdf",
				ingestionDate: "2026-04-26T10:00:00.000Z",
			});
			await db.insert(schema.facts).values({
				id: "e4-closure-fact",
				propertyId: "LIE-001",
				category: "financial",
				key: "invoice_paid",
				value: "paid",
				sourceId: "e4-closure-source",
				isGoldStandard: false,
				confidenceScore: 0.97,
			});
			await db.insert(schema.factHouses).values({
				factId: "e4-closure-fact",
				houseId: "LIE-001-H1",
			});
			await db.insert(schema.factApartments).values({
				factId: "e4-closure-fact",
				apartmentId: "LIE-001-H1-A1",
			});

			const accepted = await lifecycle.evaluateGuardedClosureAction({
				caseId: caseRow.id,
				propertyId: "LIE-001",
				proposedAction: "close_case",
				proposedConfidence: 0.91,
				confidenceThreshold: 0.8,
				nowIso: "2026-04-26T11:00:00.000Z",
				contextSummary: "invoice evidence found via MCP context bundle",
			});
			expect(accepted).toEqual({
				closed: true,
				reason: "closed_with_guardrails",
				evidenceFactIds: ["e4-closure-fact"],
			});

			const closedRow = await db.query.cases.findFirst({
				where: (cases, { eq }) => eq(cases.id, caseRow.id),
			});
			expect(closedRow?.status).toBe("resolved");

			const traces = await db.query.caseActionTraces.findMany({
				where: (trace, { eq }) => eq(trace.caseId, caseRow.id),
			});
			expect(traces).toHaveLength(2);
			expect(traces.map((trace) => trace.decision)).toEqual([
				"rejected",
				"approved",
			]);

			const orchestrator = new CaseAssistOrchestrator(db, lifecycle, {
				embeddingClient,
			});
			const orchestrated = await orchestrator.run({
				caseId: caseRow.id,
				propertyId: "LIE-001",
				confidenceThreshold: 0.8,
				nowIso: "2026-04-26T12:00:00.000Z",
			});
			expect(orchestrated.bundle.case.id).toBe(caseRow.id);
			expect(orchestrated.recommendation.proposedAction).toBe("close_case");
			expect(orchestrated.guardrailResult?.reason).toBe("already_terminal");
		} finally {
			await testDb.close();
		}
	});
});
