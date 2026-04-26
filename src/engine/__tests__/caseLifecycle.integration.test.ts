import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import { cases, factCases, facts } from "../../db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import type { CaseIntent } from "../case/caseDomain";
import { computeCaseKey } from "../case/caseIdentity";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import {
	collectDayDirectories,
	runPropertyHistoryReplay,
} from "../pipelines/PropertyHistoryRunner";
import {
	CaseLifecycleService,
	factSatisfiesClosurePredicate,
	loadFactScopes,
} from "../services/CaseLifecycleService";
import { HierarchyResolver } from "../services/HierarchyResolver";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

async function createEngineDb() {
	const testDb = await createPostgresTestDb();
	const db = testDb.db;
	await db.insert(schema.properties).values({
		id: "LIE-001",
		name: "Test WEG",
	});
	await db.insert(schema.houses).values({
		id: "LIE-001-H1",
		propertyId: "LIE-001",
		name: "H1",
	});
	await db.insert(schema.apartments).values({
		id: "LIE-001-H1-A1",
		houseId: "LIE-001-H1",
		name: "Unit 1",
	});
	await db.insert(schema.users).values({
		id: "user-1",
		name: "Owner",
		email: "o@test",
	});
	return testDb;
}

describe("CaseLifecycleService integration (R2.3–R2.5)", () => {
	it("updates the same case row when the computed caseKey matches across batches", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const resolver = new HierarchyResolver({
				propertyId: "LIE-001",
				houses: [{ id: "LIE-001-H1", apartments: [{ id: "LIE-001-H1-A1", name: "Unit 1" }] }],
			});
			const lifecycle = new CaseLifecycleService(db);
			const intent: CaseIntent = {
				title: "Window defect",
				summary: "Day 1 report",
				status: "open",
				scopeHint: "apartment",
				primarySignal: "window-track",
				closurePredicate: "repair_completed",
				confidence: 0.9,
			};
			const scope = await lifecycle.resolveScopeForIntent(
				resolver,
				"LIE-001",
				{ apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
				intent,
			);
			const caseKey = computeCaseKey(scope, intent.primarySignal, intent.title);
			await lifecycle.processIntentsForDocument({
				propertyId: "LIE-001",
				intents: [{ ...intent, summary: "Day 1 report" }],
				resolver,
				documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
				nowIso: "2026-04-25T10:00:00.000Z",
			});
			const afterFirst = await db.select().from(cases).where(eq(cases.caseKey, caseKey));
			expect(afterFirst).toHaveLength(1);

			await lifecycle.processIntentsForDocument({
				propertyId: "LIE-001",
				intents: [{ ...intent, summary: "Day 5 contractor scheduled", status: "in_progress" }],
				resolver,
				documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
				nowIso: "2026-04-26T10:00:00.000Z",
			});
			const afterSecond = await db.select().from(cases).where(eq(cases.caseKey, caseKey));
			expect(afterSecond).toHaveLength(1);
			expect(afterSecond[0].summary).toContain("Day 5");
			expect(afterSecond[0].status).toBe("in_progress");
		} finally {
			await testDb.close();
		}
	});

	it("auto-resolves when a new fact satisfies the declared closure predicate", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const resolver = new HierarchyResolver({
				propertyId: "LIE-001",
				houses: [{ id: "LIE-001-H1", apartments: [{ id: "LIE-001-H1-A1", name: "Unit 1" }] }],
			});
			const lifecycle = new CaseLifecycleService(db);
			await lifecycle.processIntentsForDocument({
				propertyId: "LIE-001",
				intents: [
					{
						title: "Leak repair ticket",
						summary: "Awaiting vendor",
						status: "open",
						scopeHint: "apartment",
						primarySignal: "leak-77",
						closurePredicate: "repair_completed",
						confidence: 0.92,
					},
				],
				resolver,
				documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
				nowIso: "2026-04-25T10:00:00.000Z",
			});
			await db.insert(schema.sources).values({
				id: "source-x",
				fileId: "x.eml",
				fileType: "eml",
				ingestionDate: "2026-04-25T12:00:00.000Z",
			});
			const factId = "fact-close-1";
			await db.insert(facts).values({
				id: factId,
				propertyId: "LIE-001",
				category: "maintenance",
				key: "repair_completed",
				value: "yes",
				sourceId: "source-x",
				isGoldStandard: false,
				confidenceScore: 0.99,
			});
			await db.insert(schema.factHouses).values({ factId, houseId: "LIE-001-H1" });
			await db.insert(schema.factApartments).values({ factId, apartmentId: "LIE-001-H1-A1" });

			const scopeMap = await loadFactScopes(db, [factId]);
			const scope = scopeMap.get(factId);
			expect(scope).toBeDefined();
			if (!scope) throw new Error("Expected scope to be present for inserted fact");

			const n = await lifecycle.evaluateAutoClose({
				propertyId: "LIE-001",
				newFacts: [{ id: factId, propertyId: "LIE-001", key: "repair_completed", value: "yes", scope }],
				nowIso: "2026-04-27T10:00:00.000Z",
			});
			expect(n).toBe(1);
			const row = await db.query.cases.findFirst({
				where: (c, { eq: e }) => e(c.propertyId, "LIE-001"),
			});
			expect(row?.status).toBe("resolved");
		} finally {
			await testDb.close();
		}
	});

	it("links facts to cases when heuristic overlap matches", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const lifecycle = new CaseLifecycleService(db);
			await db.insert(schema.sources).values({
				id: "source-link-1",
				fileId: "link.eml",
				fileType: "eml",
				ingestionDate: "2026-04-25T10:00:00.000Z",
			});
			await db.insert(facts).values({
				id: "f1",
				propertyId: "LIE-001",
				category: "maintenance",
				key: "window_track_issue",
				value: "see windowtrack",
				sourceId: "source-link-1",
				isGoldStandard: false,
				confidenceScore: 0.9,
			});
			await db.insert(cases).values({
				id: "manual-case",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: null,
				ownerUserId: "user-1",
				caseKey: "h:LIE-001-H1|windowtrack|window-issue",
				closurePredicate: null,
				title: "Window",
				summary: "S",
				status: "open",
				createdAt: "2026-04-25T10:00:00.000Z",
				updatedAt: "2026-04-25T10:00:00.000Z",
			});
			const n = await lifecycle.linkFactsToCasesHeuristic({
				caseKeys: ["h:LIE-001-H1|windowtrack|window-issue"],
				propertyId: "LIE-001",
				factsForBatch: [{ id: "f1", key: "window_track_issue", value: "see windowtrack" }],
			});
			expect(n).toBeGreaterThanOrEqual(1);
			const links = await db.select().from(factCases);
			expect(links.some((l) => l.caseId === "manual-case")).toBe(true);
		} finally {
			await testDb.close();
		}
	});

	it("links new facts to existing scoped open cases from later batches", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const lifecycle = new CaseLifecycleService(db);
			await db.insert(schema.sources).values({
				id: "source-link-2",
				fileId: "later.eml",
				fileType: "eml",
				ingestionDate: "2026-04-26T10:00:00.000Z",
			});
			await db.insert(facts).values({
				id: "f2",
				propertyId: "LIE-001",
				category: "maintenance",
				key: "window_repair_completed",
				value: "Window repair for unit 1 was completed by Mueller.",
				sourceId: "source-link-2",
				isGoldStandard: false,
				confidenceScore: 0.91,
			});
			await db.insert(schema.factHouses).values({ factId: "f2", houseId: "LIE-001-H1" });
			await db.insert(schema.factApartments).values({
				factId: "f2",
				apartmentId: "LIE-001-H1-A1",
			});
			await db.insert(cases).values({
				id: "existing-open-case",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				ownerUserId: "user-1",
				caseKey: "a:LIE-001-H1-A1|windowtrack|window-repair",
				closurePredicate: "repair_completed",
				title: "Window repair request in Unit 1",
				summary: "Tenant asked for repair",
				status: "open",
				createdAt: "2026-04-25T10:00:00.000Z",
				updatedAt: "2026-04-25T10:00:00.000Z",
			});

			const linkedCaseIds = await lifecycle.linkFactsToOpenCasesHeuristic({
				propertyId: "LIE-001",
				factsForBatch: [
					{
						id: "f2",
						key: "window_repair_completed",
						value: "Window repair for unit 1 was completed by Mueller.",
						scope: {
							scopeType: "apartment",
							propertyId: "LIE-001",
							houseId: "LIE-001-H1",
							apartmentId: "LIE-001-H1-A1",
						},
					},
				],
			});

			expect(linkedCaseIds).toContain("existing-open-case");
			const links = await db.select().from(factCases);
			expect(links.some((l) => l.caseId === "existing-open-case" && l.factId === "f2")).toBe(
				true,
			);
		} finally {
			await testDb.close();
		}
	});
});

describe("factSatisfiesClosurePredicate", () => {
	it("matches predicate keys with affirmative values", () => {
		expect(factSatisfiesClosurePredicate("invoice_paid", "paid", "invoice_paid")).toBe(true);
		expect(factSatisfiesClosurePredicate("invoice_paid", "no", "invoice_paid")).toBe(false);
	});
});

describe("CaseLifecycleService guarded closure actions (E4.5)", () => {
	it("rejects closure when confidence is below threshold and persists a rejection trace", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const lifecycle = new CaseLifecycleService(db);
			await db.insert(cases).values({
				id: "guard-case-1",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				ownerUserId: "user-1",
				caseKey: "a:LIE-001-H1-A1|signal|test",
				closurePredicate: "repair_completed",
				title: "Guarded close case",
				summary: "still open",
				status: "open",
				createdAt: "2026-04-25T10:00:00.000Z",
				updatedAt: "2026-04-25T10:00:00.000Z",
			});

			await expect(
				lifecycle.evaluateGuardedClosureAction({
					caseId: "guard-case-1",
					propertyId: "LIE-001",
					proposedAction: "close_case",
					proposedConfidence: 0.5,
					confidenceThreshold: 0.8,
					nowIso: "2026-04-26T10:00:00.000Z",
					contextSummary: "low confidence recommendation",
				}),
			).resolves.toEqual({
				closed: false,
				reason: "confidence_below_threshold",
			});

			const traces = await db.select().from(schema.caseActionTraces);
			expect(traces).toHaveLength(1);
			expect(traces[0].decision).toBe("rejected");
			expect(traces[0].reason).toBe("confidence_below_threshold");
		} finally {
			await testDb.close();
		}
	});

	it("closes case when predicate evidence and scope align, and writes trace metadata", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const embeddingRefreshCalls: string[] = [];
			const lifecycle = new CaseLifecycleService(db, {
				semanticIndexService: {
					refreshCaseEmbeddingById: async (caseId: string) => {
						embeddingRefreshCalls.push(caseId);
					},
				},
			});
			await db.insert(cases).values({
				id: "guard-case-2",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				ownerUserId: "user-1",
				caseKey: "a:LIE-001-H1-A1|signal|test-2",
				closurePredicate: "repair_completed",
				title: "Guarded close case two",
				summary: "open",
				status: "open",
				createdAt: "2026-04-25T10:00:00.000Z",
				updatedAt: "2026-04-25T10:00:00.000Z",
			});
			await db.insert(schema.sources).values({
				id: "guard-source",
				fileId: "guard.eml",
				fileType: "eml",
				ingestionDate: "2026-04-25T12:00:00.000Z",
			});
			await db.insert(facts).values({
				id: "guard-fact-1",
				propertyId: "LIE-001",
				category: "maintenance",
				key: "repair_completed",
				value: "yes",
				sourceId: "guard-source",
				isGoldStandard: false,
				confidenceScore: 0.95,
			});
			await db.insert(schema.factHouses).values({
				factId: "guard-fact-1",
				houseId: "LIE-001-H1",
			});
			await db.insert(schema.factApartments).values({
				factId: "guard-fact-1",
				apartmentId: "LIE-001-H1-A1",
			});

			await expect(
				lifecycle.evaluateGuardedClosureAction({
					caseId: "guard-case-2",
					propertyId: "LIE-001",
					proposedAction: "close_case",
					proposedConfidence: 0.92,
					confidenceThreshold: 0.8,
					nowIso: "2026-04-26T10:00:00.000Z",
					contextSummary: "predicate evidence found",
				}),
			).resolves.toEqual({
				closed: true,
				reason: "closed_with_guardrails",
				evidenceFactIds: ["guard-fact-1"],
			});
			const traces = await db.select().from(schema.caseActionTraces);
			expect(traces).toHaveLength(1);
			expect(traces[0].decision).toBe("approved");
			expect(traces[0].contextSummary).toContain("predicate evidence");
			expect(embeddingRefreshCalls).toEqual(["guard-case-2"]);
		} finally {
			await testDb.close();
		}
	});
});

describe("embedding freshness after case status transitions (E4.3)", () => {
	it("refreshes case embedding when auto-close resolves a case", async () => {
		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const resolver = new HierarchyResolver({
				propertyId: "LIE-001",
				houses: [{ id: "LIE-001-H1", apartments: [{ id: "LIE-001-H1-A1", name: "Unit 1" }] }],
			});
			const embeddingRefreshCalls: string[] = [];
			const lifecycle = new CaseLifecycleService(db, {
				semanticIndexService: {
					refreshCaseEmbeddingById: async (caseId: string) => {
						embeddingRefreshCalls.push(caseId);
					},
				},
			});
			await lifecycle.processIntentsForDocument({
				propertyId: "LIE-001",
				intents: [
					{
						title: "Leak repair ticket",
						summary: "Awaiting vendor",
						status: "open",
						scopeHint: "apartment",
						primarySignal: "leak-77",
						closurePredicate: "repair_completed",
						confidence: 0.92,
					},
				],
				resolver,
				documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
				nowIso: "2026-04-25T10:00:00.000Z",
			});
			embeddingRefreshCalls.length = 0;
			await db.insert(schema.sources).values({
				id: "source-y",
				fileId: "y.eml",
				fileType: "eml",
				ingestionDate: "2026-04-25T12:00:00.000Z",
			});
			const factId = "fact-close-2";
			await db.insert(facts).values({
				id: factId,
				propertyId: "LIE-001",
				category: "maintenance",
				key: "repair_completed",
				value: "yes",
				sourceId: "source-y",
				isGoldStandard: false,
				confidenceScore: 0.99,
			});
			await db.insert(schema.factHouses).values({ factId, houseId: "LIE-001-H1" });
			await db.insert(schema.factApartments).values({ factId, apartmentId: "LIE-001-H1-A1" });
			const scopeMap = await loadFactScopes(db, [factId]);
			const scope = scopeMap.get(factId);
			if (!scope) throw new Error("Expected fact scope");
			await lifecycle.evaluateAutoClose({
				propertyId: "LIE-001",
				newFacts: [{ id: factId, propertyId: "LIE-001", key: "repair_completed", value: "yes", scope }],
				nowIso: "2026-04-27T10:00:00.000Z",
			});
			expect(embeddingRefreshCalls).toHaveLength(1);
		} finally {
			await testDb.close();
		}
	});
});

describe("full dataset case cardinality (R2.7)", () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
	});

	it("replays two synthetic day folders without duplicate caseKey rows", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "case-r2-7-"));
		tempRoots.push(root);
		const dayOne = path.join(root, "day-01");
		const dayTwo = path.join(root, "day-02");
		for (let i = 0; i < 5; i++) {
			await fs.mkdir(path.join(dayOne, "emails"), { recursive: true });
			await fs.writeFile(path.join(dayOne, "emails", `a${i}.eml`), `Subject: T-${i}\nBody TICKET-T-${i} LIE-001-H1-A1\n`, "utf8");
		}
		for (let i = 0; i < 5; i++) {
			await fs.mkdir(path.join(dayTwo, "emails"), { recursive: true });
			await fs.writeFile(path.join(dayTwo, "emails", `b${i}.eml`), `Subject: U-${i}\nBody TICKET-U-${i} LIE-001-H1-A1\n`, "utf8");
		}

		const testDb = await createEngineDb();
		const db = testDb.db;
		try {
			const gatekeeper: RelevanceGatekeeper = { isRelevant: async () => true };
			const extractor: BuildingFactExtractor = {
				extract: async (text) => {
					const m = text.match(/TICKET-([A-Z0-9-]+)/);
					const ticket = m?.[1] ?? "UNKNOWN";
					return [
						{
							category: "maintenance" as const,
							key: `case_signal_${ticket.toLowerCase()}`,
							value: ticket,
							confidenceScore: 0.9,
						},
					];
				},
			};

			const caseFromText = (text: string): CaseIntent[] => {
				const m = text.match(/TICKET-([A-Z0-9-]+)/);
				const ticket = m?.[1] ?? "UNKNOWN";
				return [
					{
						title: `Issue ${ticket}`,
						summary: "Synthetic",
						status: "open",
						scopeHint: "apartment",
						primarySignal: ticket.toLowerCase(),
						confidence: 0.85,
					},
				];
			};

			await runPropertyHistoryReplay({
				dayRootPath: root,
				runDay: async ({ datasetRootPath, noisyInputFiles }) =>
					runBaselineDryRun({
						db,
						propertyId: "LIE-001",
						datasetRootPath,
						includeCoreIngestions: false,
						noisyInputFiles,
						gatekeeper,
						extractor,
						caseExtractor: { extract: async (documentText) => caseFromText(documentText) },
						embeddingClient: {
							embedDocument: async () => Array.from({ length: 1536 }, () => 0),
							embedQuery: async () => Array.from({ length: 1536 }, () => 0),
						},
					}),
			});

			const allCases = await db.select().from(cases);
			const keys = new Set(allCases.map((c) => c.caseKey));
			expect(keys.size).toBe(allCases.length);
			expect(allCases.length).toBe(10);

			const dirs = await collectDayDirectories(root);
			expect(dirs).toHaveLength(2);
		} finally {
			await testDb.close();
		}
	});
});
