import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	type JudgeDemoDependencies,
	runJudgeDemoRunner,
} from "../judgeDemoRunner";

function createDependencies(
	overrides: Partial<JudgeDemoDependencies> = {},
): JudgeDemoDependencies {
	return {
		ensureDbReady: async () => {},
		replayHistory: async () => ({
			totalDaysProcessed: 10,
			totals: {
				factsInserted: 9,
				factsBlockedAsConflicts: 2,
				factsUpdatedIdempotent: 3,
				casesOpened: 2,
				casesUpdated: 1,
				casesResolved: 1,
			},
			conflictLogPath: "artifacts/history-conflicts.jsonl",
		}),
		runCanonicalQueries: async () => ({
			snapshots: [
				{ tool: "semantic_search", hitCount: 3, topHitIds: ["fact-1", "case-1"] },
			],
		}),
		runGuardedAssist: async () => ({
			approved: 1,
			rejected: 1,
			traceArtifactPath: "artifacts/case-action-traces.json",
		}),
		...overrides,
	};
}

describe("runJudgeDemoRunner", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempDirs.map(async (dir) => {
				await import("node:fs/promises").then(({ rm }) =>
					rm(dir, { recursive: true, force: true }),
				);
			}),
		);
	});

	it("prints canonical sections and persists a summary artifact", async () => {
		const output: string[] = [];
		const artifactRoot = await mkdtemp(
			path.join(os.tmpdir(), "judge-demo-runner-"),
		);
		tempDirs.push(artifactRoot);

		const result = await runJudgeDemoRunner({
			mode: "mock",
			dependencies: createDependencies(),
			artifactRoot,
			writeLine: (line) => output.push(line),
		});

		expect(result.exitCode).toBe(0);
		expect(output.join("\n")).toContain("=== JUDGE DEMO RUN (mode=mock) ===");
		expect(output.join("\n")).toContain("[1/5] DB readiness");
		expect(output.join("\n")).toContain("[2/5] History replay");
		expect(output.join("\n")).toContain("[3/5] Canonical MCP/semantic queries");
		expect(output.join("\n")).toContain("[4/5] Guarded case assist");
		expect(output.join("\n")).toContain("[5/5] Structured summary");
		expect(output.join("\n")).toContain("Summary artifact:");
		expect(result.summaryArtifactPath).toBeTruthy();

		const summaryJson = await readFile(result.summaryArtifactPath, "utf8");
		const summary = JSON.parse(summaryJson) as {
			mode: string;
			historyReplay: { totalDaysProcessed: number };
			facts: { inserted: number; blocked: number; idempotent: number };
			cases: { opened: number; updated: number; resolved: number };
			guardrails: { approved: number; rejected: number };
			semanticSnapshots: Array<{ tool: string; hitCount: number }>;
			artifacts: { conflicts: string; traces: string };
		};
		expect(summary.mode).toBe("mock");
		expect(summary.historyReplay.totalDaysProcessed).toBe(10);
		expect(summary.facts).toEqual({ inserted: 9, blocked: 2, idempotent: 3 });
		expect(summary.cases).toEqual({ opened: 2, updated: 1, resolved: 1 });
		expect(summary.guardrails).toEqual({ approved: 1, rejected: 1 });
		expect(summary.semanticSnapshots).toHaveLength(1);
		expect(summary.artifacts.conflicts).toBe("artifacts/history-conflicts.jsonl");
		expect(summary.artifacts.traces).toBe("artifacts/case-action-traces.json");
	});

	it("returns non-zero with remediation text for missing env config", async () => {
		const output: string[] = [];
		const result = await runJudgeDemoRunner({
			mode: "live",
			dependencies: createDependencies({
				ensureDbReady: async () => {
					const error = new Error("Missing GEMINI env");
					(error as { code?: string }).code = "MISSING_ENV_CONFIG";
					throw error;
				},
			}),
			writeLine: (line) => output.push(line),
		});

		expect(result.exitCode).toBe(1);
		expect(output.join("\n")).toContain("Remediation:");
		expect(output.join("\n")).toContain("Set GEMINI_API_KEY");
	});

	it("returns non-zero with remediation text for DB unavailable", async () => {
		const output: string[] = [];
		const result = await runJudgeDemoRunner({
			mode: "mock",
			dependencies: createDependencies({
				ensureDbReady: async () => {
					const error = new Error("connect ECONNREFUSED");
					(error as { code?: string }).code = "DB_UNAVAILABLE";
					throw error;
				},
			}),
			writeLine: (line) => output.push(line),
		});

		expect(result.exitCode).toBe(1);
		expect(output.join("\n")).toContain("Remediation:");
		expect(output.join("\n")).toContain("Run `make db-setup`");
	});

	it("returns non-zero with remediation text for MCP tool failures", async () => {
		const output: string[] = [];
		const result = await runJudgeDemoRunner({
			mode: "mock",
			dependencies: createDependencies({
				runCanonicalQueries: async () => {
					const error = new Error("semantic_search unavailable");
					(error as { code?: string }).code = "MCP_TOOL_FAILURE";
					throw error;
				},
			}),
			writeLine: (line) => output.push(line),
		});

		expect(result.exitCode).toBe(1);
		expect(output.join("\n")).toContain("Remediation:");
		expect(output.join("\n")).toContain("Verify MCP tools");
	});
});
