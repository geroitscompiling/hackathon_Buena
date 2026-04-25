import dotenv from "dotenv";
import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
  const summary = await runBaselineDryRun({ db, strictAiErrors: true });
  console.log("Baseline dry-run complete");
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
