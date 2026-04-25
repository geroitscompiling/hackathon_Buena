import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";

import * as relations from "#/db/relations";
import * as schema from "#/db/schema";
import { listCases } from "#/services/cases";
import { listFacts } from "#/services/facts";
import {
	getPropertyHierarchy,
	listPropertyHierarchies,
} from "#/services/properties";
import { createMcpTools, listMcpTools } from "#/mcp/server";

describe("mcp tools", () => {
	let sqlite: Database.Database;
	let db: ReturnType<typeof drizzle>;

	beforeAll(async () => {
		sqlite = new Database(":memory:");
		db = drizzle(sqlite, {
			schema: {
				...schema,
				...relations,
			},
		});

		sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "properties" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "houses" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "apartments" (
        "id" text PRIMARY KEY NOT NULL,
        "houseId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "users" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "email" text
      );

      CREATE TABLE IF NOT EXISTS "sources" (
        "id" text PRIMARY KEY NOT NULL,
        "fileId" text NOT NULL,
        "fileType" text NOT NULL,
        "ingestionDate" text NOT NULL,
        "documentDate" text,
        "anchorReference" text
      );

      CREATE TABLE IF NOT EXISTS "facts" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "category" text NOT NULL,
        "key" text NOT NULL,
        "value" text NOT NULL,
        "sourceId" text NOT NULL,
        "isGoldStandard" integer NOT NULL,
        "confidenceScore" real NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "cases" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "houseId" text,
        "apartmentId" text,
        "ownerUserId" text NOT NULL,
        "title" text NOT NULL,
        "summary" text NOT NULL,
        "status" text NOT NULL,
        "createdAt" text NOT NULL,
        "updatedAt" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_houses" (
        "factId" text NOT NULL,
        "houseId" text NOT NULL,
        PRIMARY KEY ("factId", "houseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_apartments" (
        "factId" text NOT NULL,
        "apartmentId" text NOT NULL,
        PRIMARY KEY ("factId", "apartmentId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_cases" (
        "factId" text NOT NULL,
        "caseId" text NOT NULL,
        PRIMARY KEY ("factId", "caseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON UPDATE no action ON DELETE no action
      );
    `);

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

	it("lists only the curated MCP tools", async () => {
		const listedTools = listMcpTools(createMcpTools(db as never));

		expect(listedTools.map((tool) => tool.name)).toEqual([
			"list_property_hierarchies",
			"list_facts",
			"list_cases",
		]);
		expect(listedTools[0].inputSchema.type).toBe("object");
	});

	it("executes the plain query functions behind the MCP surface", async () => {
		const hierarchies = await listPropertyHierarchies(db as never, {
			limit: 10,
		});

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
		expect(
			(
				hierarchies as Array<{
					facts: Array<{ key: string }>;
					houses: Array<{
						facts: Array<{ key: string }>;
						apartments: Array<{ id: string; facts: Array<{ key: string }> }>;
					}>;
				}>
			)[0].houses[0].apartments[0].id,
		).toBe("LIE-001-H1-A1");
		expect(
			(
				hierarchies as Array<{
					facts: Array<{ key: string }>;
					houses: Array<{
						facts: Array<{ key: string }>;
						apartments: Array<{ facts: Array<{ key: string }> }>;
					}>;
				}>
			)[0].facts[0].key,
		).toBe("door_status");
		expect(
			(
				hierarchies as Array<{
					houses: Array<{
						facts: Array<{ key: string }>;
						apartments: Array<{ facts: Array<{ key: string }> }>;
					}>;
				}>
			)[0].houses[0].facts[0].key,
		).toBe("door_status");
		expect(hierarchy.id).toBe("LIE-001");
		expect(hierarchy.houses).toHaveLength(1);
		expect(hierarchy.houses[0].apartments[0].id).toBe("LIE-001-H1-A1");
		expect(hierarchy.houses[0].apartments[0].facts[0].key).toBe("door_status");
		expect(facts).toHaveLength(1);
		expect(facts[0].key).toBe("door_status");
		expect(cases).toHaveLength(1);
		expect(cases[0].owner.name).toBe("Alice Manager");
	});
});
