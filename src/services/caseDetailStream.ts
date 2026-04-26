import { getCaseDetail, type CaseDetail } from "#/services/caseDetails";

export type CaseDetailStreamUpdate = {
	kind: "initial" | "update";
	detail: CaseDetail;
};

export function getCaseDetailStreamVersion(detail: CaseDetail) {
	return JSON.stringify({
		caseUpdatedAt: detail.case.updatedAt,
		evidenceCount: detail.evidence.length,
		guardrailTraceCount: detail.guardrailTraces.length,
		agentRuns: detail.agentRuns.map((run) => ({
			id: run.id,
			status: run.status,
			finishedAt: run.finishedAt,
			messageCount: run.messages.length,
			lastMessageAt: run.messages.at(-1)?.createdAt ?? null,
			toolCallCount: run.toolCalls.length,
			lastToolCallAt: run.toolCalls.at(-1)?.createdAt ?? null,
		})),
	});
}

export async function* watchCaseDetailUpdates(options: {
	caseId: string;
	signal: AbortSignal;
	pollIntervalMs?: number;
	maxDurationMs?: number;
	getDetail?: (caseId: string) => Promise<CaseDetail>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}): AsyncGenerator<CaseDetailStreamUpdate> {
	const getDetail = options.getDetail ?? ((caseId: string) => getCaseDetail(undefined, caseId));
	const sleep =
		options.sleep ??
		((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const pollIntervalMs = options.pollIntervalMs ?? 750;
	const maxDurationMs = options.maxDurationMs ?? 30_000;
	const now = options.now ?? (() => Date.now());
	const startedAt = now();

	let lastVersion: string | null = null;
	let emittedInitial = false;

	while (!options.signal.aborted && now() - startedAt <= maxDurationMs) {
		const detail = await getDetail(options.caseId);
		const version = getCaseDetailStreamVersion(detail);

		if (!emittedInitial || version !== lastVersion) {
			yield {
				kind: emittedInitial ? "update" : "initial",
				detail,
			};
			emittedInitial = true;
			lastVersion = version;
		}

		if (options.signal.aborted || now() - startedAt > maxDurationMs) {
			break;
		}

		await sleep(pollIntervalMs);
	}
}
