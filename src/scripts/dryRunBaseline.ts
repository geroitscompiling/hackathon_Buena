import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";

async function main() {
  const summary = await runBaselineDryRun({ db });
  console.log("Baseline dry-run complete");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Baseline dry-run failed", error);
  process.exit(1);
});
