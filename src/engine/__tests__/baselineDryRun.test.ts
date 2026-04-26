import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	cases,
	factApartments,
	factCases,
	factHouses,
	facts,
	properties,
	sources,
} from "../../db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import type { CaseDocumentExtractor } from "../services/CaseExtractor";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

describe("Baseline dry-run pipeline", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeEach(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;

		await db.insert(properties).values({
			id: "LIE-001",
			name: "WEG Immanuelkirchstraße 26",
		});
		await db.insert((await import("../../db/schema")).houses).values({
			id: "LIE-001-H1",
			propertyId: "LIE-001",
			name: "Front House",
		});
		await db.insert((await import("../../db/schema")).apartments).values({
			id: "LIE-001-H1-A1",
			houseId: "LIE-001-H1",
			name: "Unit 1",
		});
		await db.insert((await import("../../db/schema")).users).values({
			id: "user-1",
			name: "Owner",
			email: "o@test",
		});
	});

	afterEach(async () => {
		await testDb?.close();
	});

	it("treats only coreIngestionRelativePaths as core for noisy scheduling metrics", async () => {
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			propertyName: "WEG Immanuelkirchstraße 26",
			datasetRootPath: "testfiles",
			includeCoreIngestions: true,
			coreIngestionRelativePaths: ["stammdaten/stammdaten.json"],
			noisyInputFiles: [],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async () => [
					{
						category: "maintenance",
						key: "unused_for_this_run",
						value: "true",
						confidenceScore: 0.9,
					},
				],
			},
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.noisySourcesScheduled).toBe(0);
		expect(summary.noisySourcesEvaluated).toBe(0);
	});

	it("persists baseline ERP and filtered noisy facts with gold semantics", async () => {
		const gatekeeper: RelevanceGatekeeper = { isRelevant: async () => true };
		const extractor: BuildingFactExtractor = {
			extract: async (documentText) =>
				documentText.includes("Subject:")
					? [
							{
								category: "maintenance",
								key: "repair",
								value: "Am 24.10. wurde eine Heizungsreparatur fuer LIE-001-H1-A1 angefragt.",
								confidenceScore: 0.91,
							},
					  ]
					: [
							{
								category: "financial",
								key: "payment",
								value: "Die Rechnung 20251203_DL-015_INV-00184 ist weiterhin offen.",
								confidenceScore: 0.88,
							},
					  ],
		};

		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			propertyName: "WEG Immanuelkirchstraße 26",
			datasetRootPath: "testfiles",
			noisyInputFiles: [
				"emails/2026-01/20260101_074000_EMAIL-06545.eml",
				"rechnungen/2025-12/20251203_DL-015_INV-00184.pdf",
			],
			gatekeeper,
			extractor,
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.sourcesPersisted).toBe(4);
		expect(summary.factsInserted).toBeGreaterThan(2);
		expect(summary.factsBlockedAsConflicts).toBe(0);
		expect(summary.factsUpdatedIdempotent).toBeGreaterThan(0);
		expect(summary.goldFactsPersisted).toBeGreaterThan(1);
		expect(summary.nonGoldFactsPersisted).toBe(2);
		expect(summary.noisySourcesScheduled).toBe(2);
		expect(summary.noisySourcesEvaluated).toBe(2);

		const property = await db.select().from(properties).where(eq(properties.id, "LIE-001"));
		expect(property).toHaveLength(1);

		const persistedSources = await db.select().from(sources);
		expect(persistedSources).toHaveLength(4);

		const goldFact = await db
			.select()
			.from(facts)
			.where(and(eq(facts.key, "baujahr"), eq(facts.isGoldStandard, true)));
		expect(goldFact).toHaveLength(1);

		const aiFact = await db
			.select()
			.from(facts)
			.where(and(eq(facts.key, "repair"), eq(facts.isGoldStandard, false)));
		expect(aiFact).toHaveLength(1);
		expect(aiFact[0]?.validFrom).toBe("2026-01-01");

		const goldRow = goldFact[0];
		expect(goldRow?.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("writes scoped links and blocks AI overwrite of matching gold semantic identity", async () => {
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			propertyName: "WEG Immanuelkirchstraße 26",
			datasetRootPath: "testfiles",
			noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async (documentText) =>
					documentText.includes("Subject:")
						? [
								{
									category: "maintenance",
									key: "repair",
									value: "Am 24.10. wurde eine Reparatur fuer die Wohnung LIE-001-H1-A1 beantragt.",
									confidenceScore: 0.91,
								},
								{
									category: "core_erp",
									key: "baujahr",
									value: "1991",
									confidenceScore: 0.8,
								},
						  ]
						: [],
			},
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.factsBlockedAsConflicts).toBe(1);
		const baujahrFacts = await db.select().from(facts).where(eq(facts.key, "baujahr"));
		expect(baujahrFacts).toHaveLength(1);
		const aiFacts = await db
			.select()
			.from(facts)
			.where(eq(facts.key, "repair"));
		expect(aiFacts).toHaveLength(1);
		const houseLinks = await db
			.select()
			.from(factHouses)
			.where(eq(factHouses.factId, aiFacts[0].id));
		const aptLinks = await db
			.select()
			.from(factApartments)
			.where(eq(factApartments.factId, aiFacts[0].id));
		expect(houseLinks).toHaveLength(1);
		expect(aptLinks).toHaveLength(1);
	});

	it("uses preloaded existing gold facts when evaluating replay writes", async () => {
		let sawPreloadedFacts = false;
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			datasetRootPath: "testfiles",
			noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async () => [
					{
						category: "maintenance",
						key: "repair",
						value: "Am 24.10. wurde eine Reparatur fuer die Heizungsanlage angefragt.",
						confidenceScore: 0.91,
					},
				],
			},
			preloadedExistingFacts: [
				{
					id: "existing-gold-1",
					scope: { scopeType: "property", propertyId: "LIE-001" },
					category: "core_erp",
					key: "baujahr",
					value: "1990",
					sourceId: "stammdaten.json",
					isGoldStandard: true,
				},
			],
			factPersistencePolicy: {
				evaluate: async ({ existingFacts }) => {
					sawPreloadedFacts = existingFacts.some((fact) => fact.id === "existing-gold-1");
					return { outcome: "inserted" };
				},
			},
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.factsInserted).toBeGreaterThan(0);
		expect(sawPreloadedFacts).toBe(true);
	});

	it("emits conflict callback entries for blocked writes", async () => {
		const conflictEntries: Array<{ reason: string; key: string }> = [];
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			datasetRootPath: "testfiles",
			noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async () => [
					{
						category: "core_erp",
						key: "baujahr",
						value: "1998",
						confidenceScore: 0.8,
					},
				],
			},
			preloadedExistingFacts: [
				{
					id: "gold-1",
					scope: { scopeType: "property", propertyId: "LIE-001" },
					category: "core_erp",
					key: "baujahr",
					value: "1990",
					sourceId: "stammdaten.json",
					isGoldStandard: true,
				},
			],
			onConflict: async (entry) => {
				conflictEntries.push({ reason: entry.reason, key: entry.key });
			},
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.factsBlockedAsConflicts).toBeGreaterThan(0);
		expect(conflictEntries).toContainEqual({
			reason: "existing_gold_fact_same_semantic_identity",
			key: "baujahr",
		});
	});

	it("persists cases and fact_case links when caseExtractor is configured", async () => {
		const caseExtractor: CaseDocumentExtractor = {
			extract: async (documentText) =>
				documentText.includes("Subject:")
					? [
							{
								title: "Window follow-up",
								summary: "From email",
								status: "open",
								scopeHint: "apartment",
								primarySignal: "windowtrack",
								confidence: 0.88,
							},
					  ]
					: [],
		};

		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			datasetRootPath: "testfiles",
			noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async (documentText) =>
					documentText.includes("Subject:")
						? [
								{
									category: "maintenance",
									key: "windowtrack_signal",
									value: "LIE-001-H1-A1",
									confidenceScore: 0.9,
								},
						  ]
						: [],
			},
			caseExtractor,
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(summary.casesOpened).toBeGreaterThanOrEqual(1);
		expect((await db.select().from(cases)).length).toBeGreaterThanOrEqual(1);
		expect((await db.select().from(factCases)).length).toBeGreaterThanOrEqual(1);
		expect(summary.assistRuns).toBeGreaterThanOrEqual(1);
	});

	it("runs MCP assist orchestration during case lifecycle processing", async () => {
		let assistCalls = 0;
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			datasetRootPath: "testfiles",
			noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
			gatekeeper: { isRelevant: async () => true },
			extractor: {
				extract: async () => [
					{
						category: "maintenance",
						key: "windowtrack_signal",
						value: "LIE-001-H1-A1",
						confidenceScore: 0.9,
					},
				],
			},
			caseExtractor: {
				extract: async () => [
					{
						title: "Window orchestration",
						summary: "From email",
						status: "open",
						scopeHint: "apartment",
						primarySignal: "windowtrack",
						confidence: 0.9,
					},
				],
			},
			caseAssistOrchestrator: {
				run: async () => {
					assistCalls += 1;
					return {
						bundle: {
							case: { id: "case-x" },
							relatedCases: [],
							relatedFacts: [],
						},
						recommendation: {
							proposedAction: "keep_open",
							confidence: 0.6,
							why: "stubbed",
						},
					};
				},
			},
			embeddingClient: {
				embedDocument: async () => Array.from({ length: 1536 }, () => 0),
				embedQuery: async () => Array.from({ length: 1536 }, () => 0),
			},
		});

		expect(assistCalls).toBeGreaterThanOrEqual(1);
		expect(summary.assistRuns).toBe(assistCalls);
	});
});
