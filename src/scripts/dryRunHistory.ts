import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

import { db, queryClient } from "../db";
import { runPropertyHistoryReplay } from "../engine/pipelines/PropertyHistoryRunner";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import {
  GeminiCaseExtractor,
  type CaseDocumentExtractor,
} from "../engine/services/CaseExtractor";
import { GeminiService } from "../engine/services/GeminiService";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../engine/types";
import { getServerEnv } from "../env";

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
  try {
  const mode = (process.env.HISTORY_MODE ?? "mock").trim().toLowerCase();
  if (mode !== "mock" && mode !== "live") {
    throw new Error(`Unsupported HISTORY_MODE: ${mode}. Use "mock" or "live".`);
  }
  const dayFilter = process.env.HISTORY_DAY?.trim() || process.env.DAY?.trim() || undefined;

  let subjectEmailCount = 0;
  const propertyId = "LIE-001";
  const dayRootPath = path.resolve("testfiles/HistoryPopulationData");
  const conflictLogPath = path.resolve("artifacts/history-conflicts.jsonl");
  await mkdir(path.dirname(conflictLogPath), { recursive: true });

  const gatekeeper: RelevanceGatekeeper | undefined =
    mode === "mock"
      ? {
          isRelevant: async () => true,
        }
      : undefined;
  const extractor: BuildingFactExtractor | undefined =
    mode === "mock"
      ? {
          extract: async (documentText) => {
            if (documentText.includes("Subject:")) {
              subjectEmailCount += 1;
              const rows = [
                {
                  category: "core_erp" as const,
                  key: "baujahr",
                  value: "1992",
                  confidenceScore: 0.84,
                },
                {
                  category: "maintenance" as const,
                  key: "window_issue",
                  value: "LIE-001-H1-A1",
                  confidenceScore: 0.91,
                },
                {
                  category: "maintenance" as const,
                  key: "stairwell_issue",
                  value: "LIE-001-H1",
                  confidenceScore: 0.9,
                },
              ];
              if (subjectEmailCount > 1) {
                rows.push({
                  category: "maintenance",
                  key: "repair_completed",
                  value: "yes",
                  confidenceScore: 0.99,
                });
              }
              return rows;
            }
            return [];
          },
        }
      : undefined;

  const caseExtractor: CaseDocumentExtractor | undefined =
    mode === "mock"
      ? {
          extract: async (documentText) => {
            if (!documentText.includes("Subject:")) {
              return [];
            }
            return [
              {
                title: "Window repair batch",
                summary: "Tracked from history email",
                status: "open",
                scopeHint: "apartment",
                primarySignal: "windowtrack",
                closurePredicate: "repair_completed",
                confidence: 0.9,
              },
            ];
          },
        }
      : new GeminiCaseExtractor(
          new GeminiService({ model: getServerEnv().GEMINI_MODEL_EXTRACTOR }),
          { strictErrors: true },
        );

  const maxCasesPerRun =
    mode === "mock"
      ? Number.parseInt(process.env.MAX_CASES_PER_RUN ?? "1", 10)
      : undefined;
  if (maxCasesPerRun !== undefined && Number.isNaN(maxCasesPerRun)) {
    throw new Error("MAX_CASES_PER_RUN must be a number when set");
  }

  const replay = await runPropertyHistoryReplay({
    dayRootPath,
    dayFilter,
    runDay: async ({ dayLabel, datasetRootPath, noisyInputFiles }) => {
      const preloadedExistingFacts = await preloadExistingGoldFacts(propertyId);
      return runBaselineDryRun({
        db,
        propertyId,
        datasetRootPath,
        includeCoreIngestions: false,
        noisyInputFiles,
        gatekeeper,
        extractor,
        caseExtractor,
        maxCasesPerRun,
        preloadedExistingFacts,
        onConflict: async (entry) => {
          await appendFile(
            conflictLogPath,
            `${JSON.stringify({ ...entry, dayLabel })}\n`,
            "utf8",
          );
        },
      });
    },
  });

  console.log("History dry-run complete");
  console.log(`Mode: ${mode}`);
  if (dayFilter) {
    console.log(`Day filter: ${dayFilter}`);
  }
  console.log(JSON.stringify(replay, null, 2));
  console.log(`Conflict log stored at: ${conflictLogPath}`);
  console.log(`Days processed: ${replay.totalDaysProcessed}`);
  console.log(`Conflicts blocked: ${replay.totals.factsBlockedAsConflicts}`);
  } finally {
    await queryClient.end();
  }
}

main().catch((error) => {
  console.error("History dry-run failed", error);
  process.exit(1);
});
