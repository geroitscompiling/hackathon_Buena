import dotenv from "dotenv";
import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../engine/types";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  const mode = (process.env.BASELINE_MODE ?? "live").trim().toLowerCase();
  if (mode !== "mock" && mode !== "live") {
    throw new Error(`Unsupported BASELINE_MODE: ${mode}. Use "mock" or "live".`);
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
        }
      : undefined;

  const summary = await runBaselineDryRun({
    db,
    strictAiErrors: true,
    gatekeeper,
    extractor,
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
