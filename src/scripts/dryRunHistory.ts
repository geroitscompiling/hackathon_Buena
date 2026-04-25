import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../engine/types";

dotenv.config({ path: [".env.local", ".env"] });

async function preloadExistingGoldFacts(propertyId: string) {
  const existingFacts = await db.query.facts.findMany({
    where: (factsTable, { and, eq }) =>
      and(eq(factsTable.propertyId, propertyId), eq(factsTable.isGoldStandard, true)),
    with: {
      houseLinks: true,
      apartmentLinks: true,
    },
  });

  return existingFacts.map((fact) => {
    const apartmentId = fact.apartmentLinks[0]?.apartmentId;
    const houseId = fact.houseLinks[0]?.houseId;
    const scopeType = apartmentId ? "apartment" : houseId ? "house" : "property";
    return {
      id: fact.id,
      scope: {
        scopeType,
        propertyId: fact.propertyId,
        houseId,
        apartmentId,
      } as const,
      category: fact.category,
      key: fact.key,
      value: fact.value,
      sourceId: fact.sourceId,
      isGoldStandard: fact.isGoldStandard,
    };
  });
}

async function main() {
  const propertyId = "LIE-001";
  const conflictLogPath = path.resolve("artifacts/history-conflicts.jsonl");
  await mkdir(path.dirname(conflictLogPath), { recursive: true });

  const preloadedExistingFacts = await preloadExistingGoldFacts(propertyId);
  const gatekeeper: RelevanceGatekeeper = {
    isRelevant: async () => true,
  };
  const extractor: BuildingFactExtractor = {
    extract: async (documentText) => {
      if (documentText.includes("Subject:")) {
        return [
          {
            category: "core_erp",
            key: "baujahr",
            value: "1992",
            confidenceScore: 0.84,
          },
          {
            category: "maintenance",
            key: "window_issue",
            value: "LIE-001-H1-A1",
            confidenceScore: 0.91,
          },
          {
            category: "maintenance",
            key: "stairwell_issue",
            value: "LIE-001-H1",
            confidenceScore: 0.9,
          },
        ];
      }
      return [];
    },
  };

  const summary = await runBaselineDryRun({
    db,
    propertyId,
    noisyInputFiles: ["emails/2026-01/20260101_074000_EMAIL-06545.eml"],
    gatekeeper,
    extractor,
    preloadedExistingFacts,
    onConflict: async (entry) => {
      await appendFile(conflictLogPath, `${JSON.stringify(entry)}\n`, "utf8");
    },
  });

  console.log("History dry-run complete");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Conflict log stored at: ${conflictLogPath}`);
  console.log(`Conflicts blocked: ${summary.factsBlockedAsConflicts}`);
}

main().catch((error) => {
  console.error("History dry-run failed", error);
  process.exit(1);
});
