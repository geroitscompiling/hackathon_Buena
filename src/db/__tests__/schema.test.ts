import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";
import {
	apartmentsRelations,
	casesRelations,
	factApartmentsRelations,
	factCasesRelations,
	factHousesRelations,
	factsRelations,
	housesRelations,
	propertiesRelations,
	sourcesRelations,
	usersRelations,
} from "../relations";
import {
	apartments,
	cases,
	factApartments,
	factCases,
	factHouses,
	facts,
	houses,
	properties,
	sources,
	users,
} from "../schema";

describe("Database Schema", () => {
	let sqlite: Database.Database;
	let db: ReturnType<typeof drizzle>;

	beforeAll(() => {
		sqlite = new Database(":memory:");
		db = drizzle(sqlite, {
			schema: {
				apartments,
				apartmentsRelations,
				cases,
				casesRelations,
				factApartments,
				factApartmentsRelations,
				factCases,
				factCasesRelations,
				factHouses,
				factHousesRelations,
				facts,
				factsRelations,
				houses,
				housesRelations,
				properties,
				propertiesRelations,
				sources,
				sourcesRelations,
				users,
				usersRelations,
			},
		});

		// Create tables
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
	});

	it("should insert and retrieve a source and a fact", async () => {
		const sourceId = "source-123";
		const factId = "fact-123";

		await db.insert(properties).values({
			id: "LIE-001",
			name: "Immanuelkirchstrasse 26",
		});

		// Insert Source
		await db.insert(sources).values({
			id: sourceId,
			fileId: "stammdaten.json",
			fileType: "json",
			ingestionDate: new Date().toISOString(),
		});

		// Insert Fact
		await db.insert(facts).values({
			id: factId,
			propertyId: "LIE-001",
			category: "core_erp",
			key: "baujahr",
			value: "1990", // SQLite stores text/numbers, Drizzle can handle types, but we'll use text for now or JSON
			sourceId: sourceId,
			isGoldStandard: true,
			confidenceScore: 1.0,
		});

		// Retrieve Fact
		const retrievedFacts = await db
			.select()
			.from(facts)
			.where(eq(facts.id, factId));
		expect(retrievedFacts.length).toBe(1);
		expect(retrievedFacts[0].propertyId).toBe("LIE-001");
		expect(retrievedFacts[0].isGoldStandard).toBe(true);

		// Retrieve Source
		const retrievedSources = await db
			.select()
			.from(sources)
			.where(eq(sources.id, retrievedFacts[0].sourceId));
		expect(retrievedSources.length).toBe(1);
		expect(retrievedSources[0].fileId).toBe("stammdaten.json");
	});

	it("should resolve hierarchical and case relations without changing fact fields", async () => {
		const propertyId = "LIE-002";
		const houseId = "LIE-002-H1";
		const apartmentId = "LIE-002-H1-A1";
		const userId = "user-1";
		const sourceId = "source-456";
		const factId = "fact-456";
		const caseId = "case-456";

		await db.insert(properties).values({
			id: propertyId,
			name: "Example Property",
		});

		await db.insert(houses).values({
			id: houseId,
			propertyId,
			name: "House 1",
		});

		await db.insert(apartments).values({
			id: apartmentId,
			houseId,
			name: "Apartment 1",
		});

		await db.insert(users).values({
			id: userId,
			name: "Case Owner",
			email: "owner@example.com",
		});

		await db.insert(sources).values({
			id: sourceId,
			fileId: "EMAIL-001.eml",
			fileType: "eml",
			ingestionDate: new Date().toISOString(),
		});

		await db.insert(facts).values({
			id: factId,
			propertyId,
			category: "maintenance",
			key: "leak_detected",
			value: "true",
			sourceId,
			isGoldStandard: false,
			confidenceScore: 0.98,
		});

		await db.insert(cases).values({
			id: caseId,
			propertyId,
			houseId,
			apartmentId,
			ownerUserId: userId,
			title: "Water leak in apartment",
			summary: "Leak reported under kitchen sink",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});

		await db.insert(factHouses).values({
			factId,
			houseId,
		});

		await db.insert(factApartments).values({
			factId,
			apartmentId,
		});

		await db.insert(factCases).values({
			factId,
			caseId,
		});

		const retrievedFact = await db.query.facts.findFirst({
			where: eq(facts.id, factId),
			with: {
				property: true,
				source: true,
				houseLinks: {
					with: {
						house: true,
					},
				},
				apartmentLinks: {
					with: {
						apartment: true,
					},
				},
				caseLinks: {
					with: {
						case: {
							with: {
								owner: true,
								property: true,
								house: true,
								apartment: true,
							},
						},
					},
				},
			},
		});

		expect(retrievedFact?.property.id).toBe(propertyId);
		expect(retrievedFact?.source.fileId).toBe("EMAIL-001.eml");
		expect(retrievedFact?.houseLinks).toHaveLength(1);
		expect(retrievedFact?.houseLinks[0].house.id).toBe(houseId);
		expect(retrievedFact?.apartmentLinks).toHaveLength(1);
		expect(retrievedFact?.apartmentLinks[0].apartment.id).toBe(apartmentId);
		expect(retrievedFact?.caseLinks).toHaveLength(1);
		expect(retrievedFact?.caseLinks[0].case.owner.name).toBe("Case Owner");
		expect(retrievedFact?.caseLinks[0].case.house?.id).toBe(houseId);
		expect(retrievedFact?.caseLinks[0].case.apartment?.id).toBe(apartmentId);
	});
});
