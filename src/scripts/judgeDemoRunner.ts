import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type JudgeDemoMode = "mock" | "live";

export type JudgeDemoDependencies = {
	ensureDbReady: () => Promise<void>;
	replayHistory: () => Promise<{
		totalDaysProcessed: number;
		totals: {
			factsInserted: number;
			factsBlockedAsConflicts: number;
			factsUpdatedIdempotent: number;
			casesOpened: number;
			casesUpdated: number;
			casesResolved: number;
		};
		conflictLogPath: string;
	}>;
	runCanonicalQueries: () => Promise<{
		snapshots: Array<{
			tool: string;
			hitCount: number;
			topHitIds: string[];
		}>;
	}>;
	runGuardedAssist: () => Promise<{
		approved: number;
		rejected: number;
		traceArtifactPath: string;
	}>;
};

type RunJudgeDemoRunnerInput = {
	mode: JudgeDemoMode;
	dependencies: JudgeDemoDependencies;
	artifactRoot?: string;
	writeLine?: (line: string) => void;
};

type RunJudgeDemoRunnerResult = {
	exitCode: 0 | 1;
	summaryArtifactPath: string;
};

const DEFAULT_ARTIFACT_ROOT = path.resolve("artifacts");

function getRemediationHint(error: unknown): string {
	const code =
		typeof error === "object" && error !== null && "code" in error
			? String((error as { code?: unknown }).code ?? "")
			: "";
	if (code === "MISSING_ENV_CONFIG") {
		return "Set GEMINI_API_KEY and required model environment variables.";
	}
	if (code === "DB_UNAVAILABLE") {
		return "Run `make db-setup` and ensure Docker/Postgres is healthy.";
	}
	if (code === "MCP_TOOL_FAILURE") {
		return "Verify MCP tools and semantic index wiring before rerunning.";
	}
	return "Check logs above and rerun after fixing the failing dependency.";
}

export async function runJudgeDemoRunner({
	mode,
	dependencies,
	artifactRoot = DEFAULT_ARTIFACT_ROOT,
	writeLine = console.log,
}: RunJudgeDemoRunnerInput): Promise<RunJudgeDemoRunnerResult> {
	const summaryArtifactPath = path.join(artifactRoot, "judge-demo-summary.json");
	try {
		writeLine(`=== JUDGE DEMO RUN (mode=${mode}) ===`);
		writeLine("[1/5] DB readiness");
		await dependencies.ensureDbReady();

		writeLine("[2/5] History replay");
		const history = await dependencies.replayHistory();

		writeLine("[3/5] Canonical MCP/semantic queries");
		const queryResults = await dependencies.runCanonicalQueries();

		writeLine("[4/5] Guarded case assist");
		const guardrail = await dependencies.runGuardedAssist();

		writeLine("[5/5] Structured summary");
		const summary = {
			mode,
			historyReplay: {
				totalDaysProcessed: history.totalDaysProcessed,
			},
			facts: {
				inserted: history.totals.factsInserted,
				blocked: history.totals.factsBlockedAsConflicts,
				idempotent: history.totals.factsUpdatedIdempotent,
			},
			cases: {
				opened: history.totals.casesOpened,
				updated: history.totals.casesUpdated,
				resolved: history.totals.casesResolved,
			},
			guardrails: {
				approved: guardrail.approved,
				rejected: guardrail.rejected,
			},
			semanticSnapshots: queryResults.snapshots,
			artifacts: {
				conflicts: history.conflictLogPath,
				traces: guardrail.traceArtifactPath,
			},
		};
		await mkdir(artifactRoot, { recursive: true });
		await writeFile(summaryArtifactPath, JSON.stringify(summary, null, 2), "utf8");
		writeLine(`Summary artifact: ${summaryArtifactPath}`);
		return { exitCode: 0, summaryArtifactPath };
	} catch (error) {
		writeLine(`Error: ${error instanceof Error ? error.message : String(error)}`);
		writeLine(`Remediation: ${getRemediationHint(error)}`);
		return { exitCode: 1, summaryArtifactPath };
	}
}
