import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS,
	collectBaselineUnstructuredRelativePaths,
} from "#/engine/baseline/collectBaselineUnstructuredPaths.ts";

describe("collectBaselineUnstructuredRelativePaths", () => {
	const datasetRoot = path.resolve(__dirname, "../../../../testfiles");

	it("documents default top-level dirs for corpus extension", () => {
		expect(BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS).toEqual(["emails", "rechnungen"]);
	});

	it("collects all .eml under emails/ and .pdf under rechnungen/ (not HistoryPopulationData)", () => {
		const paths = collectBaselineUnstructuredRelativePaths(datasetRoot);

		expect(paths.length).toBe(6546 + 194);
		expect(paths.every((p) => !p.includes("HistoryPopulationData"))).toBe(true);
		expect(new Set(paths).size).toBe(paths.length);
		expect(paths.some((p) => p.startsWith("emails/2024-") && p.endsWith(".eml"))).toBe(
			true,
		);
		expect(paths.some((p) => p.startsWith("rechnungen/2024-") && p.endsWith(".pdf"))).toBe(
			true,
		);
		expect(paths.filter((p) => p.endsWith(".eml")).length).toBe(6546);
		expect(paths.filter((p) => p.endsWith(".pdf")).length).toBe(194);
	});

	it("returns POSIX-style relative paths sorted for stable ordering", () => {
		const paths = collectBaselineUnstructuredRelativePaths(datasetRoot);
		expect(paths[0] < paths[paths.length - 1]).toBe(true);
		expect(paths.every((p) => !path.isAbsolute(p))).toBe(true);
		expect(paths.every((p) => !p.includes("\\"))).toBe(true);
	});
});
