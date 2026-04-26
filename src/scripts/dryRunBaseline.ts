import dotenv from "dotenv";
import { db } from "../db";
import { runBaselineDryRun } from "../engine/pipelines/BaselineDryRunPipeline";
import { createConfiguredLlmJsonClient } from "../engine/services/LlmJsonClientFactory";
import { getServerEnv } from "../env";
import {
	createLiveCaseExtractor,
	resolveDryRunBaselineConfig,
} from "./dryRunBaselineConfig";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
	const config = resolveDryRunBaselineConfig(process.env, {
		createLiveCaseExtractor: () =>
			createLiveCaseExtractor(
				createConfiguredLlmJsonClient("extractor", getServerEnv()),
			),
	});

	const summary = await runBaselineDryRun({
		db,
		strictAiErrors: true,
		maxNoisyFiles: config.maxNoisyFiles,
		gatekeeper: config.gatekeeper,
		extractor: config.extractor,
		caseExtractor: config.caseExtractor,
		maxCasesPerRun: config.maxCasesPerRun,
	});
	console.log("Baseline dry-run complete");
	console.log(`Mode: ${config.mode}`);
	console.log(JSON.stringify(summary, null, 2));
	if (summary.noisySourcesWithFacts === 0) {
		console.warn(
			"No non-gold facts were extracted from noisy inputs. This usually means all noisy docs were filtered as irrelevant.",
		);
	}
}

main().catch((error) => {
	console.error("Baseline dry-run failed", error);
	process.exit(1);
});
