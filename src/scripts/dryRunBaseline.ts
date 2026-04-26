import dotenv from "dotenv";
import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import {
  GeminiCaseExtractor,
  type CaseDocumentExtractor,
} from "../engine/services/CaseExtractor";
import { GeminiService } from "../engine/services/GeminiService";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../engine/types";
import { getServerEnv } from "../env";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  const mode = (process.env.BASELINE_MODE ?? "live").trim().toLowerCase();
  if (mode !== "mock" && mode !== "live") {
    throw new Error(`Unsupported BASELINE_MODE: ${mode}. Use "mock" or "live".`);
  }

  const rawFileLimit = process.env.BASELINE_FILE_LIMIT?.trim();
  const maxNoisyFiles =
    rawFileLimit && rawFileLimit.length > 0
      ? Number.parseInt(rawFileLimit, 10)
      : undefined;
  if (
    maxNoisyFiles !== undefined &&
    (Number.isNaN(maxNoisyFiles) || maxNoisyFiles < 0)
  ) {
    throw new Error("BASELINE_FILE_LIMIT must be a non-negative number when set");
  }

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
              return [
                {
                  category: "maintenance",
                  key: "repair",
                  value: "Am 24.10. wurde eine zusaetzliche Heizungsreparatur fuer LIE-001-H1-A1 angefragt.",
                  confidenceScore: 0.91,
                },
              ];
            }
            return [
              {
                category: "financial",
                key: "payment",
                value: "Die Rechnung 20251203_DL-015_INV-00184 ist weiterhin offen.",
                confidenceScore: 0.88,
              },
            ];
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
                title: "Demo case from baseline email",
                summary: "Synthetic case for mock dry-run",
                status: "open" as const,
                scopeHint: "property" as const,
                primarySignal: "baseline-demo",
                confidence: 0.85,
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

  const summary = await runBaselineDryRun({
    db,
    strictAiErrors: true,
    maxNoisyFiles,
    gatekeeper,
    extractor,
    caseExtractor,
    maxCasesPerRun,
  });
  console.log("Baseline dry-run complete");
  console.log(`Mode: ${mode}`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.noisySourcesWithFacts === 0) {
    console.warn(
      "No non-gold facts were extracted from noisy inputs. This usually means all noisy docs were filtered as irrelevant."
    );
  }
}

main().catch((error) => {
  console.error("Baseline dry-run failed", error);
  process.exit(1);
});
