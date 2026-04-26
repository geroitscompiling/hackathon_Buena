import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import { createMcpTools, listMcpTools } from "#/mcp/server";
import {
	getPropertyHierarchy,
	listPropertyHierarchies,
} from "#/services/properties";
import { listCases } from "#/services/cases";
import { listFacts } from "#/services/facts";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("mcp tools", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;

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
			fileId: "stammdaten.json",
			fileType: "json",
			ingestionDate: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.facts).values({
			id: "fact-1",
			propertyId: "LIE-001",
			category: "maintenance",
			key: "door_status",
			value: "needs repair",
			sourceId: "source-1",
			isGoldStandard: false,
			confidenceScore: 0.95,
		});
		await db.insert(schema.cases).values({
			id: "case-1",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
			ownerUserId: "user-1",
			caseKey: "mcp-door|door|broken-apartment-door",
			closurePredicate: null,
			title: "Broken apartment door",
			summary: "Tenant reported a broken lock.",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.factHouses).values({
			factId: "fact-1",
			houseId: "LIE-001-H1",
		});
		await db.insert(schema.factApartments).values({
			factId: "fact-1",
			apartmentId: "LIE-001-H1-A1",
		});
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("lists the curated MCP tools including semantic search", () => {
		const listedTools = listMcpTools(createMcpTools(db as never));
		expect(listedTools.map((tool) => tool.name)).toEqual([
			"list_property_hierarchies",
			"list_facts",
			"list_cases",
			"semantic_search",
			"get_related_cases",
			"get_related_facts",
			"get_case_context_bundle",
		]);
	});

	it("executes the query functions behind the MCP surface", async () => {
		const hierarchies = await listPropertyHierarchies(db as never, { limit: 10 });
		const hierarchy = await getPropertyHierarchy(db as never, {
			propertyId: "LIE-001",
		});
		const facts = await listFacts(db as never, {
			propertyId: "LIE-001",
			limit: 10,
		});
		const cases = await listCases(db as never, {
			propertyId: "LIE-001",
			status: "open",
			limit: 10,
		});

		expect(hierarchies).toHaveLength(1);
		expect(hierarchy.houses[0].apartments[0].id).toBe("LIE-001-H1-A1");
		expect(facts[0].key).toBe("door_status");
		expect(cases[0].owner.name).toBe("Alice Manager");
	});
});
