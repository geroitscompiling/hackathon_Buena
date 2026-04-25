import type { CaseIntent } from "./caseDomain";
import type { ResolvedHierarchyScope } from "../services/HierarchyResolver";
import { computeCaseKey } from "./caseIdentity";

export type ScopedCaseIntent = {
	intent: CaseIntent;
	scope: ResolvedHierarchyScope;
	caseKey: string;
};

/**
 * Groups intents by computed `caseKey` and merges collisions (R2.8).
 * Higher `confidence` wins title and status; other titles become summary bullets.
 */
export function groupIntentsByCaseKey(rows: ScopedCaseIntent[]): Map<string, ScopedCaseIntent[]> {
	const map = new Map<string, ScopedCaseIntent[]>();
	for (const row of rows) {
		const list = map.get(row.caseKey) ?? [];
		list.push(row);
		map.set(row.caseKey, list);
	}
	return map;
}

export function mergeCaseIntentsForSameKey(group: ScopedCaseIntent[]): CaseIntent {
	if (group.length === 0) {
		throw new Error("mergeCaseIntentsForSameKey requires at least one intent");
	}
	const sorted = [...group].sort((a, b) => b.intent.confidence - a.intent.confidence);
	const winner = sorted[0].intent;
	const summaryParts: string[] = [winner.summary.trim()].filter(Boolean);

	for (const row of sorted.slice(1)) {
		const other = row.intent;
		if (normalizeTitle(other.title) !== normalizeTitle(winner.title)) {
			summaryParts.push(`• (alt title) ${other.title}: ${other.summary.trim()}`.trim());
		} else if (other.summary.trim() && other.summary.trim() !== winner.summary.trim()) {
			summaryParts.push(`• ${other.summary.trim()}`);
		}
	}

	const closurePredicate =
		sorted.find((row) => row.intent.closurePredicate)?.intent.closurePredicate ??
		winner.closurePredicate;

	return {
		title: winner.title,
		summary: summaryParts.join(" "),
		status: winner.status,
		scopeHint: winner.scopeHint,
		primarySignal: winner.primarySignal,
		closurePredicate,
		confidence: winner.confidence,
	};
}

function normalizeTitle(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function attachCaseKeys(
	intents: CaseIntent[],
	resolveScope: (intent: CaseIntent) => ResolvedHierarchyScope,
): ScopedCaseIntent[] {
	return intents.map((intent) => {
		const scope = resolveScope(intent);
		const caseKey = computeCaseKey(scope, intent.primarySignal, intent.title);
		return { intent, scope, caseKey };
	});
}
