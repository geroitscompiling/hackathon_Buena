import path from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { facts, properties, sources } from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import { CsvIngestor } from "../ingestors/CsvIngestor";
import { EmlIngestor } from "../ingestors/EmlIngestor";
import { JsonIngestor } from "../ingestors/JsonIngestor";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

describe("Integration: ERP Ingestors Pipeline", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;
		await db.insert(properties).values({
			id: "LIE-001",
			name: "Immanuelkirchstrasse 26",
		});
	});

	afterAll(async () => {
		await testDb.close();
	});

	it("JSON Pipeline: reads stammdaten.json and persists facts as Gold Standard", async () => {
		const ingestor = new JsonIngestor();
		const filePath = path.resolve("testfiles/stammdaten/stammdaten.json");
		const buildingFacts = await ingestor.ingest(filePath, "stammdaten.json");
		const sourceRef = buildingFacts[0].source;
		const sourceDbId = "source-stammdaten.json";

		await db.insert(sources).values({
			id: sourceDbId,
			fileId: sourceRef.fileId,
			fileType: sourceRef.fileType,
			ingestionDate: sourceRef.ingestionDate,
		});
		for (const fact of buildingFacts) {
			await db.insert(facts).values({
				id: fact.id,
				propertyId: fact.propertyId,
				category: fact.category,
				key: fact.key,
				value: String(fact.value),
				sourceId: sourceDbId,
				isGoldStandard: fact.isGoldStandard,
				confidenceScore: fact.confidenceScore,
			});
		}

		const baujahrFacts = await db.select().from(facts).where(
			and(eq(facts.key, "baujahr"), eq(facts.propertyId, "LIE-001")),
		);
		expect(baujahrFacts).toHaveLength(1);
		expect(baujahrFacts[0].value).toBe("1928");
		expect(baujahrFacts[0].isGoldStandard).toBe(true);
	});

	it("CSV Pipeline: reads eigentuemer.csv and persists facts as Gold Standard", async () => {
		const ingestor = new CsvIngestor();
		const filePath = path.resolve("testfiles/stammdaten/eigentuemer.csv");
		const buildingFacts = await ingestor.ingest(filePath, "eigentuemer.csv");
		const sourceRef = buildingFacts[0].source;
		const sourceDbId = "source-eigentuemer.csv";

		await db.insert(sources).values({
			id: sourceDbId,
			fileId: sourceRef.fileId,
			fileType: sourceRef.fileType,
			ingestionDate: sourceRef.ingestionDate,
		});
		for (const fact of buildingFacts) {
			await db.insert(facts).values({
				id: fact.id,
				propertyId: fact.propertyId,
				category: fact.category,
				key: fact.key,
				value: String(fact.value),
				sourceId: sourceDbId,
				isGoldStandard: fact.isGoldStandard,
				confidenceScore: fact.confidenceScore,
			});
		}

		const ownerFacts = await db
			.select()
			.from(facts)
			.where(eq(facts.category, "governance"));
		expect(ownerFacts.some((fact) => fact.key.startsWith("owner_"))).toBe(true);
	});

	it("EML AI Pipeline: persists non-gold facts from mocked AI extraction", async () => {
		const mockGatekeeper: RelevanceGatekeeper = {
			isRelevant: async () => true,
		};
		const mockExtractor: BuildingFactExtractor = {
			extract: async () => [
				{
					category: "maintenance",
					key: "heating_issue",
					value: "reported",
					confidenceScore: 0.92,
				},
			],
		};
		const ingestor = new EmlIngestor(mockGatekeeper, mockExtractor, "LIE-001");
		const filePath = path.resolve(
			"testfiles/emails/2026-01/20260101_074000_EMAIL-06545.eml",
		);
		const buildingFacts = await ingestor.ingest(filePath, "EMAIL-06545.eml");

		await db.insert(sources).values({
			id: "source-email-1",
			fileId: "EMAIL-06545.eml",
			fileType: "eml",
			ingestionDate: buildingFacts[0].source.ingestionDate,
		});
		await db.insert(facts).values({
			id: buildingFacts[0].id,
			propertyId: buildingFacts[0].propertyId,
			category: buildingFacts[0].category,
			key: buildingFacts[0].key,
			value: String(buildingFacts[0].value),
			sourceId: "source-email-1",
			isGoldStandard: buildingFacts[0].isGoldStandard,
			confidenceScore: buildingFacts[0].confidenceScore,
		});

		const storedFacts = await db.select().from(facts).where(eq(facts.key, "heating_issue"));
		expect(storedFacts).toHaveLength(1);
		expect(storedFacts[0].isGoldStandard).toBe(false);
	});
});
