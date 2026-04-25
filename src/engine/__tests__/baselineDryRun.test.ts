import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { facts, properties, sources } from "../../db/schema";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
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
        "emails/2026-01/20260101_083800_EMAIL-06547.eml",
        "rechnungen/2025-12/20251203_DL-015_INV-00184.pdf",
      ],
      gatekeeper,
      extractor,
    });

    expect(summary.sourcesPersisted).toBe(4);
    expect(summary.factsPersisted).toBeGreaterThan(2);
    expect(summary.goldFactsPersisted).toBeGreaterThan(1);
    expect(summary.nonGoldFactsPersisted).toBe(2);

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
});
