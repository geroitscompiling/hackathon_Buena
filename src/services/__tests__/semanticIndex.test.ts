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
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("formats search inputs for asymmetric retrieval", () => {
		expect(formatSemanticSearchQuery("roof leak")).toBe(
			"task: search result | query: roof leak",
		);
		expect(
			formatFactEmbeddingDocument({
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: null,
				category: "maintenance",
				key: "roof_leak",
				value: "reported after rain",
				isGoldStandard: false,
				sourceFileId: "EMAIL-1.eml",
			}),
		).toContain("key=roof_leak");
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
			factsUpdated: 1,
			casesUpdated: 1,
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
			.set({ embedding: vectorOf(1) })
			.where(eq(schema.facts.id, "fact-1"));
		await testDb.db
			.update(schema.cases)
			.set({ embedding: vectorOf(0.8, 0.2) })
			.where(eq(schema.cases.id, "case-1"));

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
});
