import { describe, expect, it } from "vitest";

import { resolveDryRunBaselineConfig } from "../dryRunBaselineConfig";

describe("dry-run baseline config", () => {
	it("does not configure case extraction by default", () => {
		const config = resolveDryRunBaselineConfig(
			{},
			{
				createLiveCaseExtractor: () => {
					throw new Error("live case extractor should not be created");
				},
			},
		);

		expect(config.caseExtractor).toBeUndefined();
		expect(config.maxCasesPerRun).toBeUndefined();
	});
});
