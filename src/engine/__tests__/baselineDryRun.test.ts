import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  factApartments,
  factHouses,
  facts,
  properties,
  sources,
} from "../../db/schema";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import type { HierarchyResolver } from "../services/HierarchyResolver";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../types";

describe("Baseline dry-run pipeline", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(async () => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite);

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
              value: true,
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
    const hierarchyResolver: Pick<HierarchyResolver, "resolve"> = {
      resolve: async ({ extractedFact }) => {
        if (extractedFact.key === "email_signal_detected") {
          return {
            scopeType: "apartment",
            propertyId: "LIE-001",
            houseId: "LIE-001-H1",
            apartmentId: "LIE-001-H1-A1",
          };
        }

        return {
          scopeType: "property",
          propertyId: "LIE-001",
        };
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
      hierarchyResolver,
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
});
