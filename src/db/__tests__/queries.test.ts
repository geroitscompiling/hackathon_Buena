import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import {
	createApartment,
	deleteApartment,
	updateApartment,
} from "#/services/apartments";
import { countCases, listCases } from "#/services/cases";
import { countFacts, listFacts, listFactsForScope } from "#/services/facts";
import { createHouse, deleteHouse, updateHouse } from "#/services/houses";
import {
	createProperty,
	deleteProperty,
	getPropertyHierarchy,
	listProperties,
	listPropertyHierarchies,
	updateProperty,
} from "#/services/properties";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("db queries", () => {
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
			caseKey: "test-door|door|broken-apartment-door",
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
		await db.insert(schema.factCases).values({
			factId: "fact-1",
			caseId: "case-1",
		});
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("lists and resolves hierarchical property queries", async () => {
		const properties = await listProperties(db, { limit: 10 });
		const hierarchies = await listPropertyHierarchies(db, { limit: 10 });
		const hierarchy = await getPropertyHierarchy(db, {
			propertyId: "LIE-001",
		});

		expect(properties).toHaveLength(1);
		expect(properties[0].id).toBe("LIE-001");
		expect(hierarchies[0].houses[0].apartments[0].id).toBe("LIE-001-H1-A1");
		expect(hierarchies[0].facts[0].key).toBe("door_status");
		expect(hierarchies[0].houses[0].facts[0].key).toBe("door_status");
		expect(hierarchies[0].houses[0].apartments[0].facts[0].key).toBe(
			"door_status",
		);
		expect(hierarchy.id).toBe("LIE-001");
		expect(hierarchy.houses[0].id).toBe("LIE-001-H1");
		expect(hierarchy.facts[0].source.fileId).toBe("stammdaten.json");
	});

	it("lists related facts and cases", async () => {
		const facts = await listFacts(db, { propertyId: "LIE-001", limit: 10 });
		const propertyFacts = await listFactsForScope(db, {
			limit: 10,
			scopeId: "LIE-001",
			scopeType: "property",
		});
		const houseFacts = await listFactsForScope(db, {
			limit: 10,
			scopeId: "LIE-001-H1",
			scopeType: "house",
		});
		const apartmentFacts = await listFactsForScope(db, {
			limit: 10,
			scopeId: "LIE-001-H1-A1",
			scopeType: "apartment",
		});
		const cases = await listCases(db, {
			propertyId: "LIE-001",
			status: "open",
			limit: 10,
		});

		expect(facts).toHaveLength(1);
		expect(facts[0].source.fileId).toBe("stammdaten.json");
		expect(facts[0].houseIds).toEqual(["LIE-001-H1"]);
		expect(facts[0].apartmentIds).toEqual(["LIE-001-H1-A1"]);
		expect(facts[0].caseIds).toEqual(["case-1"]);
		expect(propertyFacts).toHaveLength(1);
		expect(houseFacts).toHaveLength(1);
		expect(apartmentFacts).toHaveLength(1);
		expect(houseFacts[0].key).toBe("door_status");
		expect(apartmentFacts[0].key).toBe("door_status");
		expect(cases).toHaveLength(1);
		expect(cases[0].owner.name).toBe("Alice Manager");
	});

	it("counts facts and lists more than the old 100-row cap", async () => {
		await db.insert(schema.facts).values({
			id: "fact-2",
			propertyId: "LIE-001",
			category: "lease",
			key: "deposit",
			value: "2 months",
			sourceId: "source-1",
			isGoldStandard: false,
			confidenceScore: 0.9,
		});

		expect(await countFacts(db, {})).toBe(2);
		expect(await countFacts(db, { propertyId: "LIE-001" })).toBe(2);

		const listed = await listFacts(db, { limit: 150 });
		expect(listed).toHaveLength(2);
	});

	it("filters facts by content query, house scope, and gold standard", async () => {
		await db.insert(schema.facts).values({
			id: "fact-gold",
			propertyId: "LIE-001",
			category: "core_erp",
			key: "baujahr",
			value: "1928",
			sourceId: "source-1",
			isGoldStandard: true,
			confidenceScore: 1,
		});

		const byDoor = await listFacts(db, { q: "door", limit: 20 });
		expect(byDoor.map((f) => f.id)).toEqual(["fact-1"]);

		const byHouse = await listFacts(db, { houseId: "LIE-001-H1", limit: 20 });
		expect(byHouse.map((f) => f.id)).toEqual(["fact-1"]);

		const goldOnly = await listFacts(db, {
			goldStandard: "gold",
			limit: 20,
		});
		expect(goldOnly.map((f) => f.id)).toContain("fact-gold");
		expect(goldOnly.every((f) => f.isGoldStandard)).toBe(true);

		const nonGold = await listFacts(db, {
			goldStandard: "nonGold",
			limit: 20,
		});
		expect(nonGold.map((f) => f.id)).toContain("fact-1");
		expect(nonGold.every((f) => !f.isGoldStandard)).toBe(true);

		expect(await countFacts(db, { q: "door" })).toBe(1);
		expect(await countFacts(db, { goldStandard: "gold" })).toBe(1);
	});

	it("counts cases and lists more than the old 100-row cap", async () => {
		await db.insert(schema.cases).values({
			id: "case-2",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
			ownerUserId: "user-1",
			caseKey: "test-window|window|draft",
			closurePredicate: null,
			title: "Drafty window",
			summary: "Tenant reports cold draft.",
			status: "open",
			createdAt: "2026-04-25T11:00:00.000Z",
			updatedAt: "2026-04-25T11:00:00.000Z",
		});

		expect(await countCases(db, {})).toBe(2);
		expect(await countCases(db, { propertyId: "LIE-001" })).toBe(2);

		const listed = await listCases(db, { limit: 150 });
		expect(listed).toHaveLength(2);
	});

	it("filters cases by content query and status", async () => {
		const byDraft = await listCases(db, { q: "draft", limit: 50 });
		expect(byDraft.map((c) => c.id)).toEqual(["case-2"]);

		expect(await countCases(db, { q: "draft" })).toBe(1);

		const openOnly = await listCases(db, { status: "open", limit: 50 });
		expect(openOnly).toHaveLength(2);

		const byPropertyAndText = await listCases(db, {
			propertyId: "LIE-001",
			q: "door",
			limit: 50,
		});
		expect(byPropertyAndText.map((c) => c.id)).toEqual(["case-1"]);
	});

	it("creates, updates, and deletes hierarchy records", async () => {
		const property = await createProperty(db, {
			id: "LIE-003",
			name: "Neue Schonhauser 88",
		});
		const house = await createHouse(db, {
			id: "LIE-003-H1",
			propertyId: property.id,
			name: "Side House",
		});
		const apartment = await createApartment(db, {
			id: "LIE-003-H1-A1",
			houseId: house.id,
			name: "Studio 4",
		});

		expect(property.id).toBe("LIE-003");
		expect(house.propertyId).toBe("LIE-003");
		expect(apartment.houseId).toBe("LIE-003-H1");

		const updatedProperty = await updateProperty(db, {
			id: property.id,
			name: "Neue Schonhauser 88A",
		});
		const updatedHouse = await updateHouse(db, {
			id: house.id,
			name: "Rear House",
		});
		const updatedApartment = await updateApartment(db, {
			id: apartment.id,
			name: "Studio 4B",
		});

		expect(updatedProperty.name).toBe("Neue Schonhauser 88A");
		expect(updatedHouse.name).toBe("Rear House");
		expect(updatedApartment.name).toBe("Studio 4B");

		await deleteApartment(db, { id: apartment.id });
		await deleteHouse(db, { id: house.id });
		await deleteProperty(db, { id: property.id });

		const properties = await listProperties(db, { limit: 10 });
		expect(properties.some((entry) => entry.id === "LIE-003")).toBe(false);
	});

	it("deletes a property subtree together with related facts and cases", async () => {
		await deleteProperty(db, { id: "LIE-001" });

		const properties = await listProperties(db, { limit: 10 });
		const facts = await listFacts(db, { propertyId: "LIE-001", limit: 10 });
		const cases = await listCases(db, { propertyId: "LIE-001", limit: 10 });

		expect(properties.some((entry) => entry.id === "LIE-001")).toBe(false);
		expect(facts).toHaveLength(0);
		expect(cases).toHaveLength(0);
	});
});
