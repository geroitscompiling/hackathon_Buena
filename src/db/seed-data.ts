import * as schema from "./schema";

export const seedDataset = {
	properties: [
		{ id: "LIE-001", name: "Immanuelkirchstrasse 26" },
		{ id: "LIE-002", name: "Kastanienallee 12" },
	],
	houses: [
		{ id: "LIE-001-H1", propertyId: "LIE-001", name: "Front House" },
		{ id: "LIE-001-H2", propertyId: "LIE-001", name: "Courtyard House" },
		{ id: "LIE-002-H1", propertyId: "LIE-002", name: "Garden House" },
	],
	apartments: [
		{ id: "LIE-001-H1-A1", houseId: "LIE-001-H1", name: "Unit 1" },
		{ id: "LIE-001-H1-A2", houseId: "LIE-001-H1", name: "Unit 2" },
		{ id: "LIE-001-H2-A1", houseId: "LIE-001-H2", name: "Atelier Loft" },
		{ id: "LIE-002-H1-A1", houseId: "LIE-002-H1", name: "Left Wing" },
		{ id: "LIE-002-H1-A2", houseId: "LIE-002-H1", name: "Right Wing" },
		{ id: "LIE-002-H1-A3", houseId: "LIE-002-H1", name: "Penthouse" },
	],
	users: [
		{ id: "user-1", name: "Alice Manager", email: "alice@buena.test" },
		{ id: "user-2", name: "Ben Operator", email: "ben@buena.test" },
		{ id: "user-3", name: "Cara Claims", email: "cara@buena.test" },
	],
	sources: [
		{
			id: "source-1",
			fileId: "stammdaten-lie-001.json",
			fileType: "json",
			ingestionDate: "2026-04-20T08:00:00.000Z",
			documentDate: "2026-04-20",
			anchorReference: "properties.LIE-001",
		},
		{
			id: "source-2",
			fileId: "LTR-0001.pdf",
			fileType: "pdf",
			ingestionDate: "2026-04-21T09:30:00.000Z",
			documentDate: "2026-04-18",
			anchorReference: "page:2",
		},
		{
			id: "source-3",
			fileId: "EMAIL-0007.eml",
			fileType: "eml",
			ingestionDate: "2026-04-22T10:15:00.000Z",
			documentDate: "2026-04-22",
			anchorReference: "message-id:<lie001@buena.test>",
		},
		{
			id: "source-4",
			fileId: "stammdaten-lie-002.json",
			fileType: "json",
			ingestionDate: "2026-04-20T08:30:00.000Z",
			documentDate: "2026-04-20",
			anchorReference: "properties.LIE-002",
		},
		{
			id: "source-5",
			fileId: "EMAIL-0014.eml",
			fileType: "eml",
			ingestionDate: "2026-04-23T07:45:00.000Z",
			documentDate: "2026-04-23",
			anchorReference: "message-id:<lie002@buena.test>",
		},
	],
	facts: [
		{
			id: "fact-1",
			propertyId: "LIE-001",
			category: "core_erp",
			key: "baujahr",
			value: "1990",
			sourceId: "source-1",
			isGoldStandard: true,
			confidenceScore: 1,
		},
		{
			id: "fact-2",
			propertyId: "LIE-001",
			category: "maintenance",
			key: "boiler_status",
			value: "inspection_due",
			sourceId: "source-2",
			isGoldStandard: false,
			confidenceScore: 0.94,
		},
		{
			id: "fact-3",
			propertyId: "LIE-001",
			category: "safety",
			key: "smoke_detector_check",
			value: "overdue",
			sourceId: "source-3",
			isGoldStandard: false,
			confidenceScore: 0.9,
		},
		{
			id: "fact-4",
			propertyId: "LIE-001",
			category: "damage",
			key: "water_ingress",
			value: "reported_after_rain",
			sourceId: "source-3",
			isGoldStandard: false,
			confidenceScore: 0.88,
		},
		{
			id: "fact-5",
			propertyId: "LIE-002",
			category: "core_erp",
			key: "unit_count",
			value: "3",
			sourceId: "source-4",
			isGoldStandard: true,
			confidenceScore: 1,
		},
		{
			id: "fact-6",
			propertyId: "LIE-002",
			category: "maintenance",
			key: "roof_leak",
			value: "reported_by_tenant",
			sourceId: "source-5",
			isGoldStandard: false,
			confidenceScore: 0.93,
		},
	],
	cases: [
		{
			id: "case-1",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A2",
			ownerUserId: "user-1",
			caseKey: "seed-p-lie-001-boiler-a2|boiler|boiler-inspection-follow-up",
			closurePredicate: null,
			title: "Boiler inspection follow-up",
			summary: "Technician visit needs confirmation with the tenant.",
			status: "open",
			createdAt: "2026-04-22T09:00:00.000Z",
			updatedAt: "2026-04-23T11:20:00.000Z",
		},
		{
			id: "case-2",
			propertyId: "LIE-001",
			houseId: "LIE-001-H2",
			apartmentId: "LIE-001-H2-A1",
			ownerUserId: "user-2",
			caseKey: "seed-a-lie-001-h2-a1|ingress|water-ingress-in-loft",
			closurePredicate: "repair_completed" as const,
			title: "Water ingress in loft",
			summary: "Resident reported water stains after heavy rain.",
			status: "investigating",
			createdAt: "2026-04-23T08:10:00.000Z",
			updatedAt: "2026-04-24T07:30:00.000Z",
		},
		{
			id: "case-3",
			propertyId: "LIE-001",
			houseId: null,
			apartmentId: null,
			ownerUserId: "user-3",
			caseKey: "seed-p-lie-001|insurance|insurance-renewal-review",
			closurePredicate: null,
			title: "Insurance renewal review",
			summary: "Policy wording needs legal review before renewal.",
			status: "blocked",
			createdAt: "2026-04-21T12:00:00.000Z",
			updatedAt: "2026-04-24T15:45:00.000Z",
		},
		{
			id: "case-4",
			propertyId: "LIE-002",
			houseId: "LIE-002-H1",
			apartmentId: "LIE-002-H1-A3",
			ownerUserId: "user-1",
			caseKey: "seed-a-lie-002-h1-a3|roof|roof-leak-follow-up",
			closurePredicate: null,
			title: "Roof leak follow-up",
			summary: "Need roofer quote and resident access window.",
			status: "open",
			createdAt: "2026-04-23T06:30:00.000Z",
			updatedAt: "2026-04-24T09:10:00.000Z",
		},
	],
	factHouses: [
		{ factId: "fact-2", houseId: "LIE-001-H1" },
		{ factId: "fact-4", houseId: "LIE-001-H2" },
		{ factId: "fact-6", houseId: "LIE-002-H1" },
	],
	factApartments: [
		{ factId: "fact-3", apartmentId: "LIE-001-H1-A2" },
		{ factId: "fact-4", apartmentId: "LIE-001-H2-A1" },
	],
	factCases: [
		{ factId: "fact-3", caseId: "case-1" },
		{ factId: "fact-4", caseId: "case-2" },
		{ factId: "fact-6", caseId: "case-4" },
	],
} as const;

export type SeedSummary = {
	[K in keyof typeof seedDataset]: number;
};

/**
 * Resets the hierarchy dataset and inserts deterministic demo records for UI,
 * API, and MCP development.
 */
export async function seedDatabase(
	db: typeof import("./index").db,
): Promise<SeedSummary> {
	await db.delete(schema.factCases);
	await db.delete(schema.factApartments);
	await db.delete(schema.factHouses);
	await db.delete(schema.cases);
	await db.delete(schema.facts);
	await db.delete(schema.sources);
	await db.delete(schema.apartments);
	await db.delete(schema.houses);
	await db.delete(schema.properties);
	await db.delete(schema.users);

	await db.insert(schema.properties).values(seedDataset.properties);
	await db.insert(schema.houses).values(seedDataset.houses);
	await db.insert(schema.apartments).values(seedDataset.apartments);
	await db.insert(schema.users).values(seedDataset.users);
	await db.insert(schema.sources).values(seedDataset.sources);
	await db.insert(schema.facts).values(seedDataset.facts);
	await db.insert(schema.cases).values(seedDataset.cases);
	await db.insert(schema.factHouses).values(seedDataset.factHouses);
	await db.insert(schema.factApartments).values(seedDataset.factApartments);
	await db.insert(schema.factCases).values(seedDataset.factCases);

	return {
		properties: seedDataset.properties.length,
		houses: seedDataset.houses.length,
		apartments: seedDataset.apartments.length,
		users: seedDataset.users.length,
		sources: seedDataset.sources.length,
		facts: seedDataset.facts.length,
		cases: seedDataset.cases.length,
		factHouses: seedDataset.factHouses.length,
		factApartments: seedDataset.factApartments.length,
		factCases: seedDataset.factCases.length,
	};
}
