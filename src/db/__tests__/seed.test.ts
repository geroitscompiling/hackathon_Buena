import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import * as schema from "../schema";
import { seedDatabase } from "../seed-data";

function createTables(sqlite: Database.Database) {
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
}

describe("seedDatabase", () => {
	it("populates a complete hierarchy dataset and stays idempotent", async () => {
		const sqlite = new Database(":memory:");
		createTables(sqlite);

		const db = drizzle(sqlite, { schema });

		await seedDatabase(db, sqlite);
		await seedDatabase(db, sqlite);

		const properties = await db.select().from(schema.properties);
		const houses = await db.select().from(schema.houses);
		const apartments = await db.select().from(schema.apartments);
		const users = await db.select().from(schema.users);
		const sources = await db.select().from(schema.sources);
		const facts = await db.select().from(schema.facts);
		const cases = await db.select().from(schema.cases);
		const factHouses = await db.select().from(schema.factHouses);
		const factApartments = await db.select().from(schema.factApartments);
		const factCases = await db.select().from(schema.factCases);

		expect(properties).toHaveLength(2);
		expect(houses).toHaveLength(3);
		expect(apartments).toHaveLength(6);
		expect(users).toHaveLength(3);
		expect(sources).toHaveLength(5);
		expect(facts).toHaveLength(6);
		expect(cases).toHaveLength(4);
		expect(factHouses).toHaveLength(3);
		expect(factApartments).toHaveLength(2);
		expect(factCases).toHaveLength(3);
		expect(properties.map((property) => property.id)).toEqual([
			"LIE-001",
			"LIE-002",
		]);
		expect(
			cases.some((caseRecord) => caseRecord.ownerUserId === "user-1"),
		).toBe(true);
	});
});
