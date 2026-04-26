import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	apartments,
	factApartments,
	facts,
	properties,
} from "../../db/schema";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("Baseline on-demand ERP hierarchy (N0.3)", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeEach(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;
		await db.insert(properties).values({
			id: "LIE-001",
			name: "WEG Immanuelkirchstraße 26",
		});
	});

	afterEach(async () => {
		await testDb?.close();
	});

	const mockAi = {
		gatekeeper: { isRelevant: async () => true },
		extractor: {
			extract: async () => [
				{
					category: "maintenance" as const,
					key: "noop_signal",
					value: true,
					confidenceScore: 0.9,
				},
			],
		},
		embeddingClient: {
			embedDocument: async () => Array.from({ length: 1536 }, () => 0),
			embedQuery: async () => Array.from({ length: 1536 }, () => 0),
		},
	};

	it("scopes owner facts to apartments when CSV runs before hierarchy exists", async () => {
		const summary = await runBaselineDryRun({
			db,
			propertyId: "LIE-001",
			datasetRootPath: path.resolve(__dirname, "../../../testfiles"),
			coreIngestionRelativePaths: [
				"stammdaten/eigentuemer.csv",
				"stammdaten/stammdaten.json",
			],
			noisyInputFiles: [],
			...mockAi,
		});

		expect(summary.noisySourcesScheduled).toBe(0);
		expect(summary.noisySourcesEvaluated).toBe(0);

		const ownerRows = await db
			.select()
			.from(facts)
			.where(eq(facts.key, "owner_EIG-001_EH-037"));
		expect(ownerRows).toHaveLength(1);

		const links = await db
			.select()
			.from(factApartments)
			.where(eq(factApartments.factId, ownerRows[0].id));
		expect(links).toHaveLength(1);
		expect(links[0].apartmentId).toBe("LIE-001-EH-037");

		const apt = await db
			.select()
			.from(apartments)
			.where(eq(apartments.id, "LIE-001-EH-037"));
		expect(apt).toHaveLength(1);
	});

	it("keeps apartment row count stable when baseline core ingestion is repeated", async () => {
		const datasetRoot = path.resolve(__dirname, "../../../testfiles");
		const opts = {
			db,
			propertyId: "LIE-001",
			datasetRootPath: datasetRoot,
			coreIngestionRelativePaths: [
				"stammdaten/eigentuemer.csv",
				"stammdaten/stammdaten.json",
			] as const,
			noisyInputFiles: [] as string[],
			...mockAi,
		};

		const s1 = await runBaselineDryRun(opts);
		expect(s1.noisySourcesScheduled).toBe(0);
		expect(s1.noisySourcesEvaluated).toBe(0);
		const n1 = (await db.select().from(apartments)).length;
		const s2 = await runBaselineDryRun(opts);
		expect(s2.noisySourcesScheduled).toBe(0);
		expect(s2.noisySourcesEvaluated).toBe(0);
		const n2 = (await db.select().from(apartments)).length;
		expect(n2).toBe(n1);
	});
});
