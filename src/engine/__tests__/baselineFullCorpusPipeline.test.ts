import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { collectBaselineUnstructuredRelativePaths } from "../baseline/collectBaselineUnstructuredPaths";
import { runBaselineDryRun } from "../pipelines/BaselineDryRunPipeline";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("Baseline pipeline default unstructured corpus (N0.1)", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;

	afterEach(async () => {
		await testDb?.close();
	});

	it(
		"evaluates every baseline email and invoice file when noisyInputFiles is omitted",
		async () => {
			testDb = await createPostgresTestDb();
			const datasetRoot = path.resolve(__dirname, "../../../testfiles");
			const expectedNoisy = collectBaselineUnstructuredRelativePaths(datasetRoot).length;

			const summary = await runBaselineDryRun({
				db: testDb.db,
				datasetRootPath: datasetRoot,
				gatekeeper: { isRelevant: async () => true },
				extractor: {
					extract: async () => [
						{
							category: "maintenance",
							key: "bulk_mock_signal",
							value: true,
							confidenceScore: 0.9,
						},
					],
				},
				embeddingClient: {
					embedDocument: async () => Array.from({ length: 1536 }, () => 0),
					embedQuery: async () => Array.from({ length: 1536 }, () => 0),
				},
			});

			expect(summary.noisySourcesEvaluated).toBe(expectedNoisy);
		},
		300_000,
	);
});
