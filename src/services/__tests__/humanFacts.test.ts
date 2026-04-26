import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apartments, facts, houses, properties, sources } from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import {
	createHumanFact,
	HUMAN_SOURCE_ID,
	resolveFactsScopeContext,
	updateHumanFact,
} from "#/services/humanFacts";

describe("humanFacts", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;
		await db.insert(properties).values({
			id: "LIE-001",
			name: "Test property",
		});
		await db.insert(houses).values({
			id: "LIE-001-H1",
			propertyId: "LIE-001",
			name: "H1",
		});
		await db.insert(apartments).values({
			id: "LIE-001-H1-A1",
			houseId: "LIE-001-H1",
			name: "A1",
		});
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("createHumanFact inserts a fact, human source row, and optional scope links", async () => {
		const { id } = await createHumanFact(db, {
			propertyId: "LIE-001",
			category: "maintenance",
			key: "manual_note",
			value: "Human-entered repair note.",
			validFrom: "2026-04-01",
			apartmentIds: ["LIE-001-H1-A1"],
		});

		const [row] = await db.select().from(facts).where(eq(facts.id, id));
		expect(row?.validFrom).toBe("2026-04-01");
		expect(row?.isGoldStandard).toBe(false);
		expect(row?.sourceId).toBe(HUMAN_SOURCE_ID);

		const [src] = await db.select().from(sources).where(eq(sources.id, HUMAN_SOURCE_ID));
		expect(src?.fileType).toBe("human");

		const links = await db.query.factApartments.findMany({
			where: (t, { eq: e }) => e(t.factId, id),
		});
		expect(links).toHaveLength(1);
	});

	it("updateHumanFact patches fields", async () => {
		const { id } = await createHumanFact(db, {
			propertyId: "LIE-001",
			category: "governance",
			key: "k1",
			value: "v1",
		});

		await updateHumanFact(db, {
			id,
			value: "v2",
			validFrom: "2026-05-01",
		});

		const [row] = await db.select().from(facts).where(eq(facts.id, id));
		expect(row?.value).toBe("v2");
		expect(row?.validFrom).toBe("2026-05-01");
	});

	it("resolveFactsScopeContext resolves property id and presets for house scope", async () => {
		const ctx = await resolveFactsScopeContext(db, "house", "LIE-001-H1");
		expect(ctx.propertyId).toBe("LIE-001");
		expect(ctx.presetHouseIds).toEqual(["LIE-001-H1"]);
		expect(ctx.presetApartmentIds).toEqual([]);
	});

	it("resolveFactsScopeContext resolves property id and presets for apartment scope", async () => {
		const ctx = await resolveFactsScopeContext(db, "apartment", "LIE-001-H1-A1");
		expect(ctx.propertyId).toBe("LIE-001");
		expect(ctx.presetHouseIds).toEqual(["LIE-001-H1"]);
		expect(ctx.presetApartmentIds).toEqual(["LIE-001-H1-A1"]);
	});
});
