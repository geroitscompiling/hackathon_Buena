import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import * as relations from "../../db/relations";
import * as schema from "../../db/schema";
import { cases, factCases, facts } from "../../db/schema";
import type { CaseIntent } from "../case/caseDomain";
import { computeCaseKey } from "../case/caseIdentity";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import {
	collectDayDirectories,
	runPropertyHistoryReplay,
} from "../pipelines/PropertyHistoryRunner";
import {
	CaseLifecycleService,
	factSatisfiesClosurePredicate,
	loadFactScopes,
} from "../services/CaseLifecycleService";
import { HierarchyResolver } from "../services/HierarchyResolver";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

function createEngineDb(sqlite: Database.Database) {
	return drizzle(sqlite, { schema: { ...schema, ...relations } });
}

function bootstrapSchema(sqlite: Database.Database) {
	sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "properties" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "houses" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id")
      );
      CREATE TABLE IF NOT EXISTS "apartments" (
        "id" text PRIMARY KEY NOT NULL,
        "houseId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id")
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
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id"),
        FOREIGN KEY ("sourceId") REFERENCES "sources"("id")
      );
      CREATE TABLE IF NOT EXISTS "cases" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "houseId" text,
        "apartmentId" text,
        "ownerUserId" text NOT NULL,
        "caseKey" text NOT NULL,
        "closurePredicate" text,
        "title" text NOT NULL,
        "summary" text NOT NULL,
        "status" text NOT NULL,
        "createdAt" text NOT NULL,
        "updatedAt" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id"),
        FOREIGN KEY ("houseId") REFERENCES "houses"("id"),
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id"),
        FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "cases_property_case_key" ON "cases" ("propertyId","caseKey");
      CREATE TABLE IF NOT EXISTS "fact_houses" (
        "factId" text NOT NULL,
        "houseId" text NOT NULL,
        PRIMARY KEY ("factId", "houseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id"),
        FOREIGN KEY ("houseId") REFERENCES "houses"("id")
      );
      CREATE TABLE IF NOT EXISTS "fact_apartments" (
        "factId" text NOT NULL,
        "apartmentId" text NOT NULL,
        PRIMARY KEY ("factId", "apartmentId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id"),
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id")
      );
      CREATE TABLE IF NOT EXISTS "fact_cases" (
        "factId" text NOT NULL,
        "caseId" text NOT NULL,
        PRIMARY KEY ("factId", "caseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id"),
        FOREIGN KEY ("caseId") REFERENCES "cases"("id")
      );
    `);
	sqlite.exec(`
      INSERT INTO properties ("id", "name") VALUES ('LIE-001', 'Test WEG');
      INSERT INTO houses ("id", "propertyId", "name") VALUES ('LIE-001-H1', 'LIE-001', 'H1');
      INSERT INTO apartments ("id", "houseId", "name") VALUES ('LIE-001-H1-A1', 'LIE-001-H1', 'Unit 1');
      INSERT INTO users ("id", "name", "email") VALUES ('user-1', 'Owner', 'o@test');
    `);
}

describe("CaseLifecycleService integration (R2.3–R2.5)", () => {
	it("updates the same case row when the computed caseKey matches across batches", async () => {
		const sqlite = new Database(":memory:");
		bootstrapSchema(sqlite);
		const db = createEngineDb(sqlite);
		const resolver = new HierarchyResolver({
			propertyId: "LIE-001",
			houses: [
				{
					id: "LIE-001-H1",
					apartments: [{ id: "LIE-001-H1-A1", name: "Unit 1" }],
				},
			],
		});
		const lifecycle = new CaseLifecycleService(db);
		const intent: CaseIntent = {
			title: "Window defect",
			summary: "Day 1 report",
			status: "open",
			scopeHint: "apartment",
			primarySignal: "window-track",
			closurePredicate: "repair_completed",
			confidence: 0.9,
		};
		const scope = await lifecycle.resolveScopeForIntent(
			resolver,
			"LIE-001",
			{ apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
			intent,
		);
		const caseKey = computeCaseKey(scope, intent.primarySignal, intent.title);
		await lifecycle.processIntentsForDocument({
			propertyId: "LIE-001",
			intents: [{ ...intent, summary: "Day 1 report" }],
			resolver,
			documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
			nowIso: "2026-04-25T10:00:00.000Z",
		});
		const afterFirst = await db.select().from(cases).where(eq(cases.caseKey, caseKey));
		expect(afterFirst).toHaveLength(1);
		expect(afterFirst[0].summary).toContain("Day 1");

		await lifecycle.processIntentsForDocument({
			propertyId: "LIE-001",
			intents: [{ ...intent, summary: "Day 5 contractor scheduled", status: "in_progress" }],
			resolver,
			documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
			nowIso: "2026-04-26T10:00:00.000Z",
		});
		const afterSecond = await db.select().from(cases).where(eq(cases.caseKey, caseKey));
		expect(afterSecond).toHaveLength(1);
		expect(afterSecond[0].summary).toContain("Day 5");
		expect(afterSecond[0].status).toBe("in_progress");
	});

	it("auto-resolves when a new fact satisfies the declared closure predicate", async () => {
		const sqlite = new Database(":memory:");
		bootstrapSchema(sqlite);
		const db = createEngineDb(sqlite);
		const resolver = new HierarchyResolver({
			propertyId: "LIE-001",
			houses: [
				{
					id: "LIE-001-H1",
					apartments: [{ id: "LIE-001-H1-A1", name: "Unit 1" }],
				},
			],
		});
		const lifecycle = new CaseLifecycleService(db);
		const intent: CaseIntent = {
			title: "Leak repair ticket",
			summary: "Awaiting vendor",
			status: "open",
			scopeHint: "apartment",
			primarySignal: "leak-77",
			closurePredicate: "repair_completed",
			confidence: 0.92,
		};
		await lifecycle.processIntentsForDocument({
			propertyId: "LIE-001",
			intents: [intent],
			resolver,
			documentMetadata: { apartmentId: "LIE-001-H1-A1", houseId: "LIE-001-H1" },
			nowIso: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.sources).values({
			id: "source-x",
			fileId: "x.eml",
			fileType: "eml",
			ingestionDate: "2026-04-25T12:00:00.000Z",
		});
		const factId = "fact-close-1";
		await db.insert(facts).values({
			id: factId,
			propertyId: "LIE-001",
			category: "maintenance",
			key: "repair_completed",
			value: "yes",
			sourceId: "source-x",
			isGoldStandard: false,
			confidenceScore: 0.99,
		});
		await db.insert(schema.factHouses).values({ factId, houseId: "LIE-001-H1" });
		await db.insert(schema.factApartments).values({
			factId,
			apartmentId: "LIE-001-H1-A1",
		});

		const scopeMap = await loadFactScopes(db, [factId]);
		const scope = scopeMap.get(factId);
		expect(scope).toBeDefined();
		if (!scope) {
			throw new Error("Expected scope to be present for inserted fact");
		}
		const n = await lifecycle.evaluateAutoClose({
			propertyId: "LIE-001",
			newFacts: [
				{
					id: factId,
					propertyId: "LIE-001",
					key: "repair_completed",
					value: "yes",
					scope,
				},
			],
			nowIso: "2026-04-27T10:00:00.000Z",
		});
		expect(n).toBe(1);
		const row = await db.query.cases.findFirst({
			where: (c, { eq: e }) => e(c.propertyId, "LIE-001"),
		});
		expect(row?.status).toBe("resolved");
	});

	it("links facts to cases when heuristic overlap matches", async () => {
		const sqlite = new Database(":memory:");
		bootstrapSchema(sqlite);
		const db = createEngineDb(sqlite);
		const lifecycle = new CaseLifecycleService(db);
		await db.insert(schema.sources).values({
			id: "source-link-1",
			fileId: "link.eml",
			fileType: "eml",
			ingestionDate: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(facts).values({
			id: "f1",
			propertyId: "LIE-001",
			category: "maintenance",
			key: "window_track_issue",
			value: "see windowtrack",
			sourceId: "source-link-1",
			isGoldStandard: false,
			confidenceScore: 0.9,
		});
		await db.insert(cases).values({
			id: "manual-case",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: null,
			ownerUserId: "user-1",
			caseKey: "h:LIE-001-H1|windowtrack|window-issue",
			closurePredicate: null,
			title: "Window",
			summary: "S",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});
		const n = await lifecycle.linkFactsToCasesHeuristic({
			caseKeys: ["h:LIE-001-H1|windowtrack|window-issue"],
			propertyId: "LIE-001",
			factsForBatch: [{ id: "f1", key: "window_track_issue", value: "see windowtrack" }],
		});
		expect(n).toBeGreaterThanOrEqual(1);
		const links = await db.select().from(factCases);
		expect(links.some((l) => l.caseId === "manual-case")).toBe(true);
	});
});

describe("factSatisfiesClosurePredicate", () => {
	it("matches predicate keys with affirmative values", () => {
		expect(factSatisfiesClosurePredicate("invoice_paid", "paid", "invoice_paid")).toBe(
			true,
		);
		expect(factSatisfiesClosurePredicate("invoice_paid", "no", "invoice_paid")).toBe(
			false,
		);
	});
});

describe("full dataset case cardinality (R2.7)", () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempRoots.map(async (root) => {
				await fs.rm(root, { recursive: true, force: true });
			}),
		);
	});

	it("replays two synthetic day folders without duplicate caseKey rows", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "case-r2-7-"));
		tempRoots.push(root);
		const dayOne = path.join(root, "day-01");
		const dayTwo = path.join(root, "day-02");
		for (let i = 0; i < 5; i++) {
			await fs.mkdir(path.join(dayOne, "emails"), { recursive: true });
			await fs.writeFile(
				path.join(dayOne, "emails", `a${i}.eml`),
				`Subject: T-${i}\nBody TICKET-T-${i} LIE-001-H1-A1\n`,
				"utf8",
			);
		}
		for (let i = 0; i < 5; i++) {
			await fs.mkdir(path.join(dayTwo, "emails"), { recursive: true });
			await fs.writeFile(
				path.join(dayTwo, "emails", `b${i}.eml`),
				`Subject: U-${i}\nBody TICKET-U-${i} LIE-001-H1-A1\n`,
				"utf8",
			);
		}

		const sqlite = new Database(":memory:");
		bootstrapSchema(sqlite);
		const db = createEngineDb(sqlite);

		const gatekeeper: RelevanceGatekeeper = { isRelevant: async () => true };
		const extractor: BuildingFactExtractor = {
			extract: async (text) => {
				const m = text.match(/TICKET-([A-Z0-9-]+)/);
				const ticket = m?.[1] ?? "UNKNOWN";
				return [
					{
						category: "maintenance" as const,
						key: `case_signal_${ticket.toLowerCase()}`,
						value: ticket,
						confidenceScore: 0.9,
					},
				];
			},
		};

		const caseFromText = (text: string): CaseIntent[] => {
			const m = text.match(/TICKET-([A-Z0-9-]+)/);
			const ticket = m?.[1] ?? "UNKNOWN";
			return [
				{
					title: `Issue ${ticket}`,
					summary: "Synthetic",
					status: "open",
					scopeHint: "apartment",
					primarySignal: ticket.toLowerCase(),
					confidence: 0.85,
				},
			];
		};

		await runPropertyHistoryReplay({
			dayRootPath: root,
			runDay: async ({ datasetRootPath, noisyInputFiles }) => {
				return runBaselineDryRun({
					db,
					propertyId: "LIE-001",
					datasetRootPath,
					includeCoreIngestions: false,
					noisyInputFiles,
					gatekeeper,
					extractor,
					caseExtractor: {
						extract: async (documentText) => caseFromText(documentText),
					},
				});
			},
		});

		const allCases = await db.select().from(cases);
		const keys = new Set(allCases.map((c) => c.caseKey));
		expect(keys.size).toBe(allCases.length);
		expect(allCases.length).toBe(10);

		const dirs = await collectDayDirectories(root);
		expect(dirs).toHaveLength(2);
	});
});
