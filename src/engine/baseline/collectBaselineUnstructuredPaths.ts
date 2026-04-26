import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Top-level folders under the dataset root scanned for baseline `.eml` / `.pdf`. Extend when adding new fixture trees. */
export const BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS = ["emails", "rechnungen"] as const;

function walkFilesRecursive(absoluteDir: string, datasetRoot: string, acc: string[]): void {
	for (const ent of readdirSync(absoluteDir, { withFileTypes: true })) {
		const full = path.join(absoluteDir, ent.name);
		if (ent.isDirectory()) {
			walkFilesRecursive(full, datasetRoot, acc);
		} else if (ent.isFile()) {
			const rel = path.relative(datasetRoot, full);
			const posixRel = rel.split(path.sep).join("/");
			if (posixRel.includes("HistoryPopulationData")) {
				continue;
			}
			if (posixRel.endsWith(".eml") || posixRel.endsWith(".pdf")) {
				acc.push(posixRel);
			}
		}
	}
}

/**
 * Lists unstructured baseline inputs: all `.eml` / `.pdf` under each of
 * {@link BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS} relative to the dataset root, excluding paths under
 * `HistoryPopulationData` (replay corpus).
 */
export function collectBaselineUnstructuredRelativePaths(datasetRootAbsolute: string): string[] {
	const resolvedRoot = path.resolve(datasetRootAbsolute);
	if (!statSync(resolvedRoot, { throwIfNoEntry: false })?.isDirectory()) {
		return [];
	}

	const acc: string[] = [];
	for (const root of BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS) {
		const dir = path.join(resolvedRoot, root);
		if (statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
			walkFilesRecursive(dir, resolvedRoot, acc);
		}
	}

	return acc.sort((a, b) => a.localeCompare(b));
}
