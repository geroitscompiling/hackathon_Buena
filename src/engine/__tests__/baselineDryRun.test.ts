import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as relations from "../../db/relations";
import * as schema from "../../db/schema";
import {
  cases,
  factApartments,
  factCases,
  factHouses,
  facts,
  properties,
  sources,
} from "../../db/schema";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import type { CaseDocumentExtractor } from "../services/CaseExtractor";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

describe("Baseline dry-run pipeline", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
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
      CREATE TABLE IF NOT EXISTS "fact_houses" (
        "factId" text NOT NULL,
        "houseId" text NOT NULL,
        PRIMARY KEY ("factId", "houseId")
      );
      CREATE TABLE IF NOT EXISTS "fact_apartments" (
        "factId" text NOT NULL,
        "apartmentId" text NOT NULL,
        PRIMARY KEY ("factId", "apartmentId")
      );
      CREATE TABLE IF NOT EXISTS "houses" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "name" text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "apartments" (
        "id" text PRIMARY KEY NOT NULL,
        "houseId" text NOT NULL,
        "name" text NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "users" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "email" text
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
      CREATE TABLE IF NOT EXISTS "fact_cases" (
        "factId" text NOT NULL,
        "caseId" text NOT NULL,
        PRIMARY KEY ("factId", "caseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id"),
        FOREIGN KEY ("caseId") REFERENCES "cases"("id")
      );
    `);

    sqlite.exec(`
      INSERT INTO properties ("id", "name") VALUES ('LIE-001', 'WEG Immanuelkirchstraße 26');
      INSERT INTO houses ("id", "propertyId", "name") VALUES ('LIE-001-H1', 'LIE-001', 'Front House');
      INSERT INTO apartments ("id", "houseId", "name") VALUES ('LIE-001-H1-A1', 'LIE-001-H1', 'Unit 1');
      INSERT INTO users ("id", "name", "email") VALUES ('user-1', 'Owner', 'o@test');
    `);
  });

  it("persists baseline ERP and filtered noisy facts with gold semantics", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: async () => true,
    };
    const extractor: BuildingFactExtractor = {
      extract: async (documentText) => {
        if (documentText.includes("Subject:")) {
          return [
            {
              category: "maintenance",
              key: "email_signal_detected",
              value: true,
              confidenceScore: 0.91,
            },
          ];
        }

        return [
          {
            category: "financial",
            key: "invoice_signal_detected",
            value: true,
            confidenceScore: 0.88,
          },
        ];
      },
    };

    const summary = await runBaselineDryRun({
      db,
      propertyId: "LIE-001",
      propertyName: "WEG Immanuelkirchstraße 26",
      datasetRootPath: "testfiles",
      noisyInputFiles: [
        "emails/2026-01/20260101_074000_EMAIL-06545.eml",
        "rechnungen/2025-12/20251203_DL-015_INV-00184.pdf",
      ],
      gatekeeper,
      extractor,
    });

    expect(summary.sourcesPersisted).toBe(4);
    expect(summary.factsInserted).toBeGreaterThan(2);
    expect(summary.factsBlockedAsConflicts).toBe(0);
    expect(summary.factsUpdatedIdempotent).toBeGreaterThan(0);
    expect(summary.factsPersisted).toBeGreaterThan(2);
    expect(summary.goldFactsPersisted).toBeGreaterThan(1);
    expect(summary.nonGoldFactsPersisted).toBe(2);
    expect(summary.noisySourcesEvaluated).toBe(2);
    expect(summary.noisySourcesWithFacts).toBe(2);

    const property = await db.select().from(properties).where(eq(properties.id, "LIE-001"));
    expect(property).toHaveLength(1);

    const persistedSources = await db.select().from(sources);
    expect(persistedSources).toHaveLength(4);

    const goldFact = await db
      .select()
      .from(facts)
      .where(and(eq(facts.key, "baujahr"), eq(facts.isGoldStandard, true)));
    expect(goldFact).toHaveLength(1);

    const aiFact = await db
      .select()
      .from(facts)
      .where(and(eq(facts.key, "email_signal_detected"), eq(facts.isGoldStandard, false)));
    expect(aiFact).toHaveLength(1);
  });

  it("writes scoped links and blocks AI overwrite of matching gold semantic identity", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: async () => true,
    };
    const extractor: BuildingFactExtractor = {
      extract: async (documentText) => {
        if (documentText.includes("Subject:")) {
          return [
            {
              category: "maintenance",
              key: "email_signal_detected",
              value: "LIE-001-H1-A1",
              confidenceScore: 0.91,
            },
            {
              category: "core_erp",
              key: "baujahr",
              value: "1991",
              confidenceScore: 0.8,
            },
          ];
        }

        return [];
      },
    };
    const summary = await runBaselineDryRun({
      db,
      propertyId: "LIE-001",
      propertyName: "WEG Immanuelkirchstraße 26",
      datasetRootPath: "testfiles",
      noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
      gatekeeper,
      extractor,
    });

    expect(summary.factsBlockedAsConflicts).toBe(1);
    expect(summary.factsInserted).toBe(summary.factsPersisted);

    const baujahrFacts = await db
      .select()
      .from(facts)
      .where(eq(facts.key, "baujahr"));
    expect(baujahrFacts).toHaveLength(1);

    const scopedFactLinks = await db.select().from(factHouses);
    const scopedApartmentLinks = await db.select().from(factApartments);
    expect(scopedFactLinks).toHaveLength(1);
    expect(scopedApartmentLinks).toHaveLength(1);
  });

  it("uses preloaded existing gold facts when evaluating replay writes", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: async () => true,
    };
    const extractor: BuildingFactExtractor = {
      extract: async () => [
        {
          category: "maintenance",
          key: "email_signal_detected",
          value: true,
          confidenceScore: 0.91,
        },
      ],
    };
    let sawPreloadedFacts = false;
    const summary = await runBaselineDryRun({
      db,
      propertyId: "LIE-001",
      datasetRootPath: "testfiles",
      noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
      gatekeeper,
      extractor,
      preloadedExistingFacts: [
        {
          id: "existing-gold-1",
          scope: { scopeType: "property", propertyId: "LIE-001" },
          category: "core_erp",
          key: "baujahr",
          value: "1990",
          sourceId: "stammdaten.json",
          isGoldStandard: true,
        },
      ],
      factPersistencePolicy: {
        evaluate: async ({ existingFacts }) => {
          sawPreloadedFacts = existingFacts.some((fact) => fact.id === "existing-gold-1");
          return { outcome: "inserted" };
        },
      },
    });

    expect(summary.factsInserted).toBeGreaterThan(0);
    expect(sawPreloadedFacts).toBe(true);
  });

  it("emits conflict callback entries for blocked writes", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: async () => true,
    };
    const extractor: BuildingFactExtractor = {
      extract: async () => [
        {
          category: "core_erp",
          key: "baujahr",
          value: "1998",
          confidenceScore: 0.8,
        },
      ],
    };
    const conflictEntries: Array<{
      reason: string;
      key: string;
    }> = [];

    const summary = await runBaselineDryRun({
      db,
      propertyId: "LIE-001",
      datasetRootPath: "testfiles",
      noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
      gatekeeper,
      extractor,
      preloadedExistingFacts: [
        {
          id: "gold-1",
          scope: { scopeType: "property", propertyId: "LIE-001" },
          category: "core_erp",
          key: "baujahr",
          value: "1990",
          sourceId: "stammdaten.json",
          isGoldStandard: true,
        },
      ],
      onConflict: async (entry) => {
        conflictEntries.push({ reason: entry.reason, key: entry.key });
      },
    });

    expect(summary.factsBlockedAsConflicts).toBeGreaterThan(0);
    expect(conflictEntries).toContainEqual({
      reason: "existing_gold_fact_same_semantic_identity",
      key: "baujahr",
    });
  });

  it("persists cases and fact_case links when caseExtractor is configured", async () => {
    const gatekeeper: RelevanceGatekeeper = { isRelevant: async () => true };
    const extractor: BuildingFactExtractor = {
      extract: async (documentText) => {
        if (documentText.includes("Subject:")) {
          return [
            {
              category: "maintenance",
              key: "windowtrack_signal",
              value: "LIE-001-H1-A1",
              confidenceScore: 0.9,
            },
          ];
        }
        return [];
      },
    };
    const caseExtractor: CaseDocumentExtractor = {
      extract: async (documentText) => {
        if (!documentText.includes("Subject:")) return [];
        return [
          {
            title: "Window follow-up",
            summary: "From email",
            status: "open",
            scopeHint: "apartment",
            primarySignal: "windowtrack",
            confidence: 0.88,
          },
        ];
      },
    };

    const summary = await runBaselineDryRun({
      db,
      propertyId: "LIE-001",
      datasetRootPath: "testfiles",
      noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
      gatekeeper,
      extractor,
      caseExtractor,
    });

    expect(summary.casesOpened).toBeGreaterThanOrEqual(1);
    const caseRows = await db.select().from(cases);
    expect(caseRows.length).toBeGreaterThanOrEqual(1);
    const links = await db.select().from(factCases);
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
