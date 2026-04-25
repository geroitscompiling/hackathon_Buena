import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../schema";
import { seedDatabase } from "../seed-data";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("seedDatabase", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("populates a complete hierarchy dataset and stays idempotent", async () => {
		const db = testDb.db;

		await seedDatabase(db as never);
		await seedDatabase(db as never);

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
