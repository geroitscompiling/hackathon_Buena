import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import * as schema from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import {
	formatCaseEmbeddingDocument,
	formatFactEmbeddingDocument,
	formatSemanticSearchQuery,
	SemanticIndexService,
	semanticSearch,
	semanticSearchSchema,
	SEMANTIC_SEARCH_MAX_RESULTS,
} from "../semanticIndex";

function vectorOf(first: number, second = 0): number[] {
	return [first, second, ...Array.from({ length: 1534 }, () => 0)];
}

describe("semanticIndex", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		const { db } = testDb;

		await db.insert(schema.properties).values({
			id: "LIE-001",
			name: "Immanuelkirchstrasse 26",
		});
		await db.insert(schema.properties).values({
			id: "LIE-002",
			name: "Other Property",
		});
		await db.insert(schema.houses).values({
			id: "LIE-001-H1",
			propertyId: "LIE-001",
			name: "Front House",
		});
		await db.insert(schema.houses).values({
			id: "LIE-002-H1",
			propertyId: "LIE-002",
			name: "Rear House",
		});
		await db.insert(schema.apartments).values({
			id: "LIE-001-H1-A1",
			houseId: "LIE-001-H1",
			name: "Unit 1",
		});
		await db.insert(schema.apartments).values({
			id: "LIE-002-H1-A1",
			houseId: "LIE-002-H1",
			name: "Unit 2",
		});
		await db.insert(schema.users).values({
			id: "user-1",
			name: "Alice Manager",
			email: "alice@example.com",
		});
		await db.insert(schema.sources).values({
			id: "source-1",
			fileId: "EMAIL-1.eml",
			fileType: "eml",
			ingestionDate: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.sources).values({
			id: "source-2",
			fileId: "EMAIL-2.eml",
			fileType: "eml",
			ingestionDate: "2026-04-25T11:00:00.000Z",
		});
		await db.insert(schema.sources).values({
			id: "source-stamm",
			fileId: "stammdaten.json",
			fileType: "json",
			ingestionDate: "2026-04-25T12:00:00.000Z",
		});
		await db.insert(schema.facts).values({
			id: "fact-1",
			propertyId: "LIE-001",
			category: "maintenance",
			key: "roof_leak",
			value: "reported after rain",
			sourceId: "source-1",
			isGoldStandard: false,
			confidenceScore: 0.9,
		});
		await db.insert(schema.factHouses).values({
			factId: "fact-1",
			houseId: "LIE-001-H1",
		});
		await db.insert(schema.facts).values({
			id: "fact-gold",
			propertyId: "LIE-001",
			category: "identity",
			key: "building_year",
			value: "1998",
			sourceId: "source-stamm",
			isGoldStandard: true,
			confidenceScore: 1,
		});
		await db.insert(schema.factHouses).values({
			factId: "fact-gold",
			houseId: "LIE-001-H1",
		});
		await db.insert(schema.cases).values({
			id: "case-1",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
			ownerUserId: "user-1",
			caseKey: "roof|leak|follow-up",
			closurePredicate: null,
			title: "Roof leak follow-up",
			summary: "Resident reported water ingress from the roof.",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.facts).values({
			id: "fact-2",
			propertyId: "LIE-002",
			category: "maintenance",
			key: "boiler_noise",
			value: "reported in rear house",
			sourceId: "source-2",
			isGoldStandard: false,
			confidenceScore: 0.8,
		});
		await db.insert(schema.factHouses).values({
			factId: "fact-2",
			houseId: "LIE-002-H1",
		});
		await db.insert(schema.factApartments).values({
			factId: "fact-2",
			apartmentId: "LIE-002-H1-A1",
		});
		await db.insert(schema.cases).values({
			id: "case-2",
			propertyId: "LIE-002",
			houseId: "LIE-002-H1",
			apartmentId: "LIE-002-H1-A1",
			ownerUserId: "user-1",
			caseKey: "boiler|noise|follow-up",
			closurePredicate: null,
			title: "Boiler noise follow-up",
			summary: "Rear house boiler issue",
			status: "open",
			createdAt: "2026-04-25T11:00:00.000Z",
			updatedAt: "2026-04-25T11:00:00.000Z",
		});
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("semanticSearchSchema allows limit up to SEMANTIC_SEARCH_MAX_RESULTS", () => {
		expect(
			semanticSearchSchema.parse({ query: "roof", limit: SEMANTIC_SEARCH_MAX_RESULTS })
				.limit,
		).toBe(SEMANTIC_SEARCH_MAX_RESULTS);
		expect(() =>
			semanticSearchSchema.parse({
				query: "roof",
				limit: SEMANTIC_SEARCH_MAX_RESULTS + 1,
			}),
		).toThrow();
	});

	it("formats search inputs for asymmetric retrieval", () => {
		expect(formatSemanticSearchQuery("roof leak")).toBe(
			"task: search result | query: roof leak",
		);
		const factDoc = formatFactEmbeddingDocument({
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: null,
			category: "maintenance",
			key: "roof_leak",
			value: "reported after rain",
			isGoldStandard: false,
			sourceFileId: "EMAIL-1.eml",
			validFrom: "2026-04-01",
		});
		expect(factDoc).toContain("key=roof_leak");
		expect(factDoc).toContain("validFrom=2026-04-01");
		expect(
			formatCaseEmbeddingDocument({
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				title: "Roof leak follow-up",
				summary: "Resident reported water ingress from the roof.",
				status: "open",
				closurePredicate: null,
				ownerName: "Alice Manager",
			}),
		).toContain("title: Roof leak follow-up");
	});

	it("backfills missing embeddings for facts and cases", async () => {
		const indexService = new SemanticIndexService(testDb.db, {
			embedDocument: async () => vectorOf(0.9, 0.1),
			embedQuery: async () => vectorOf(0.9, 0.1),
		});

		await expect(indexService.backfillMissingEmbeddings()).resolves.toEqual({
			factsUpdated: 3,
			casesUpdated: 2,
		});

		const fact = await testDb.db.query.facts.findFirst({
			where: (facts, { eq }) => eq(facts.id, "fact-1"),
		});
		const row = await testDb.db.query.cases.findFirst({
			where: (cases, { eq }) => eq(cases.id, "case-1"),
		});

		expect(fact?.embedding).toEqual(vectorOf(0.9, 0.1));
		expect(row?.embedding).toEqual(vectorOf(0.9, 0.1));
	});

	it("returns mixed semantic search results filtered by scope", async () => {
		await testDb.db
			.update(schema.facts)
			.set({ embedding: null })
			.where(eq(schema.facts.id, "fact-gold"));
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-1"));
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(0.2, 0.8) })
			.where(eq(schema.facts.id, "fact-2"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(0.8, 0.2) })
			.where(eq(schema.cases.id, "case-1"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(0.2, 0.8) })
			.where(eq(schema.cases.id, "case-2"));

		const results = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "roof leak",
				entityType: "all",
				houseId: "LIE-001-H1",
				limit: 5,
			},
		);

		expect(results).toHaveLength(2);
		expect(results[0].entityType).toBe("fact");
		expect(results[1].entityType).toBe("case");
		expect(results[0].snippet).toContain("roof_leak");
	});

	it("keeps canonical prompt target within top-3 results", async () => {
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-1"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(0.99, 0.01) })
			.where(eq(schema.cases.id, "case-1"));

		const results = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "roof leak reported in unit one",
				entityType: "all",
				limit: 5,
			},
		);

		expect(results.slice(0, 3).map((row) => row.id)).toContain("fact-1");
	});

	it("applies scope filters by property, house and apartment", async () => {
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-1"));
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(0.9, 0.1) })
			.where(eq(schema.facts.id, "fact-2"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.cases.id, "case-1"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(0.9, 0.1) })
			.where(eq(schema.cases.id, "case-2"));

		const byProperty = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "maintenance issues",
				entityType: "all",
				propertyId: "LIE-001",
				limit: 10,
			},
		);
		expect(byProperty.every((row) => {
			const payload = row.payload as { propertyId?: string };
			return payload.propertyId === "LIE-001";
		})).toBe(true);

		const byHouse = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "maintenance issues",
				entityType: "all",
				houseId: "LIE-001-H1",
				limit: 10,
			},
		);
		expect(byHouse.every((row) => {
			const payload = row.payload as { houseId?: string; houseIds?: string[] };
			return payload.houseId === "LIE-001-H1" || payload.houseIds?.includes("LIE-001-H1");
		})).toBe(true);

		const byApartment = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "maintenance issues",
				entityType: "all",
				apartmentId: "LIE-001-H1-A1",
				limit: 10,
			},
		);
		expect(byApartment.every((row) => {
			const payload = row.payload as { apartmentId?: string; apartmentIds?: string[] };
			return payload.apartmentId === "LIE-001-H1-A1" || payload.apartmentIds?.includes("LIE-001-H1-A1");
		})).toBe(true);
	});

	it("filters facts by gold standard when requested", async () => {
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-1"));
		await testDb.db
			.update(schema.facts)
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-gold"));

		const goldOnly = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "building year stamm",
				entityType: "fact",
				goldStandard: "gold",
				limit: 10,
			},
		);

		expect(goldOnly.map((row) => row.id)).toEqual(["fact-gold"]);

		const nonGold = await semanticSearch(
			{
				embedDocument: async () => vectorOf(1),
				embedQuery: async () => vectorOf(1),
			},
			testDb.db,
			{
				query: "maintenance roof",
				entityType: "fact",
				goldStandard: "nonGold",
				limit: 10,
			},
		);

		expect(nonGold.map((row) => row.id)).toContain("fact-1");
		expect(nonGold.map((row) => row.id)).not.toContain("fact-gold");
		expect(
			nonGold.every(
				(row) =>
					row.entityType === "fact" &&
					(row.payload as { isGoldStandard: boolean }).isGoldStandard === false,
			),
		).toBe(true);
	});
});
