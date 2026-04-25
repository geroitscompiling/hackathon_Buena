import { eq } from "drizzle-orm";

import { cases, factCases } from "../../db/schema";
import type {
	CaseClosurePredicate,
	CaseIntent,
	CaseUpsertCommand,
} from "../case/caseDomain";
import { TERMINAL_CASE_STATUS } from "../case/caseDomain";
import { computeCaseKey } from "../case/caseIdentity";
import {
	groupIntentsByCaseKey,
	mergeCaseIntentsForSameKey,
	type ScopedCaseIntent,
} from "../case/caseIntentMerge";
import type { HierarchyResolver } from "./HierarchyResolver";
import type { ResolvedHierarchyScope } from "./HierarchyResolver";
import { createHash } from "node:crypto";
import type { db as appDb } from "../../db";

type CaseLifecycleDb = typeof appDb;

const ACTIVE_STATUSES = [
	"open",
	"in_progress",
	"investigating",
];

export type NewFactSnapshot = {
	id: string;
	propertyId: string;
	key: string;
	value: string;
	scope: ResolvedHierarchyScope;
};

export interface CaseLifecycleCounters {
	casesOpened: number;
	casesUpdated: number;
}

export type CaseIntentBatchResult = CaseLifecycleCounters & { caseKeys: string[] };

function deterministicCaseId(propertyId: string, caseKey: string): string {
	const h = createHash("sha256").update(`${propertyId}::${caseKey}`).digest("hex");
	return `case-${h.slice(0, 26)}`;
}

export function factValueImpliesClosure(value: string): boolean {
	const v = value.trim().toLowerCase();
	return (
		v === "true" ||
		v === "yes" ||
		v === "paid" ||
		v === "1" ||
		v === "completed" ||
		v === "resolved" ||
		v === "confirmed"
	);
}

export function factSatisfiesClosurePredicate(
	factKey: string,
	factValue: string,
	predicate: CaseClosurePredicate,
): boolean {
	return factKey === predicate && factValueImpliesClosure(factValue);
}

function scopesAlign(
	caseRow: { propertyId: string; houseId?: string | null; apartmentId?: string | null },
	factScope: ResolvedHierarchyScope,
): boolean {
	if (caseRow.apartmentId) {
		return (
			factScope.scopeType === "apartment" && factScope.apartmentId === caseRow.apartmentId
		);
	}
	if (caseRow.houseId) {
		return (
			(factScope.scopeType === "house" && factScope.houseId === caseRow.houseId) ||
			(factScope.scopeType === "apartment" && factScope.houseId === caseRow.houseId)
		);
	}
	return factScope.propertyId === caseRow.propertyId;
}

export class CaseLifecycleService {
	constructor(
		private readonly db: CaseLifecycleDb,
		private readonly options: { defaultOwnerUserId?: string } = {},
	) {}

	defaultOwner(): string {
		return this.options.defaultOwnerUserId ?? "user-1";
	}

	resolveScopeForIntent(
		resolver: Pick<HierarchyResolver, "resolve">,
		propertyId: string,
		documentMetadata: {
			houseId?: string;
			apartmentId?: string;
			unitLabel?: string;
		},
		intent: CaseIntent,
	): Promise<ResolvedHierarchyScope> {
		return resolver.resolve({
			propertyId,
			documentMetadata,
			extractedFact: {
				key: intent.primarySignal,
				value: intent.title,
			},
		});
	}

	mergeAndNormalizeIntents(rows: ScopedCaseIntent[]): Map<string, { merged: CaseIntent; scope: ResolvedHierarchyScope; caseKey: string }> {
		const groups = groupIntentsByCaseKey(rows);
		const out = new Map<string, { merged: CaseIntent; scope: ResolvedHierarchyScope; caseKey: string }>();
		for (const [caseKey, group] of groups) {
			const merged = mergeCaseIntentsForSameKey(group);
			const scope = group[0].scope;
			const recomputedKey = computeCaseKey(scope, merged.primarySignal, merged.title);
			const key = recomputedKey === caseKey ? caseKey : recomputedKey;
			out.set(key, { merged, scope, caseKey: key });
		}
		return out;
	}

	async upsertCaseFromCommand(
		cmd: CaseUpsertCommand,
		nowIso: string,
	): Promise<{ opened: boolean; updated: boolean }> {
		const id = deterministicCaseId(cmd.propertyId, cmd.caseKey);
		const existing = await this.db.query.cases.findFirst({
			where: (c, { and: a, eq: e }) => a(e(c.propertyId, cmd.propertyId), e(c.caseKey, cmd.caseKey)),
		});

		if (!existing) {
			await this.db.insert(cases).values({
				id,
				propertyId: cmd.propertyId,
				houseId: cmd.houseId ?? null,
				apartmentId: cmd.apartmentId ?? null,
				ownerUserId: cmd.ownerUserId,
				caseKey: cmd.caseKey,
				closurePredicate: cmd.closurePredicate ?? null,
				title: cmd.title,
				summary: cmd.summary,
				status: cmd.status,
				createdAt: nowIso,
				updatedAt: nowIso,
			});
			return { opened: true, updated: false };
		}

		const nextStatus =
			existing.status === TERMINAL_CASE_STATUS ? existing.status : cmd.status;
		await this.db
			.update(cases)
			.set({
				title: cmd.title,
				summary: cmd.summary,
				status: nextStatus,
				closurePredicate: cmd.closurePredicate ?? existing.closurePredicate,
				updatedAt: nowIso,
				houseId: cmd.houseId ?? existing.houseId,
				apartmentId: cmd.apartmentId ?? existing.apartmentId,
			})
			.where(eq(cases.id, existing.id));

		return { opened: false, updated: true };
	}

	async processIntentsForDocument(input: {
		propertyId: string;
		intents: CaseIntent[];
		resolver: Pick<HierarchyResolver, "resolve">;
		documentMetadata: {
			houseId?: string;
			apartmentId?: string;
			unitLabel?: string;
		};
		nowIso: string;
	}): Promise<CaseIntentBatchResult> {
		const counters: CaseLifecycleCounters = {
			casesOpened: 0,
			casesUpdated: 0,
		};
		if (input.intents.length === 0) {
			return { ...counters, caseKeys: [] };
		}

		const scoped: ScopedCaseIntent[] = [];
		for (const intent of input.intents) {
			const scope = await this.resolveScopeForIntent(
				input.resolver,
				input.propertyId,
				input.documentMetadata,
				intent,
			);
			const caseKey = computeCaseKey(scope, intent.primarySignal, intent.title);
			scoped.push({ intent, scope, caseKey });
		}

		const mergedMap = this.mergeAndNormalizeIntents(scoped);
		const owner = this.defaultOwner();

		for (const { merged, scope, caseKey } of mergedMap.values()) {
			const cmd: CaseUpsertCommand = {
				caseKey,
				title: merged.title,
				summary: merged.summary,
				status: merged.status,
				propertyId: input.propertyId,
				houseId: scope.houseId,
				apartmentId: scope.apartmentId,
				ownerUserId: owner,
				closurePredicate: merged.closurePredicate,
			};
			const { opened, updated } = await this.upsertCaseFromCommand(cmd, input.nowIso);
			if (opened) counters.casesOpened += 1;
			if (updated) counters.casesUpdated += 1;
		}

		return { ...counters, caseKeys: [...mergedMap.keys()] };
	}

	async linkFactsToCasesHeuristic(input: {
		caseKeys: string[];
		propertyId: string;
		factsForBatch: Array<{ id: string; key: string; value: string }>;
	}): Promise<number> {
		if (input.caseKeys.length === 0 || input.factsForBatch.length === 0) {
			return 0;
		}
		const caseRows = await this.db.query.cases.findMany({
			where: (c, { and: a, eq: e, inArray: inArr }) =>
				a(e(c.propertyId, input.propertyId), inArr(c.caseKey, input.caseKeys)),
		});
		let links = 0;
		for (const caseRow of caseRows) {
			const keyTokens = caseRow.caseKey
				.split(/[^a-z0-9]+/i)
				.map((token) => token.trim().toLowerCase())
				.filter((token) => token.length >= 6)
				.filter((token) => !GENERIC_CASE_KEY_TOKENS.has(token));
			for (const fact of input.factsForBatch) {
				const fk = fact.key.toLowerCase();
				const fv = String(fact.value).toLowerCase();
				const compactFactKey = fk.replace(/[^a-z0-9]/g, "");
				const overlapScore = keyTokens.reduce((score, token) => {
					const compactToken = token.replace(/[^a-z0-9]/g, "");
					const exactWordMatch =
						new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`).test(fk) ||
						new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`).test(fv);
					const strongCompactMatch =
						compactToken.length >= 8 && compactFactKey.includes(compactToken);
					return score + (exactWordMatch || strongCompactMatch ? 1 : 0);
				}, 0);
				if (overlapScore < 1) continue;
				try {
					await this.db.insert(factCases).values({
						factId: fact.id,
						caseId: caseRow.id,
					});
					links += 1;
				} catch {
					/* duplicate PK */
				}
			}
		}
		return links;
	}

	async evaluateAutoClose(input: {
		propertyId: string;
		newFacts: NewFactSnapshot[];
		nowIso: string;
	}): Promise<number> {
		if (input.newFacts.length === 0) {
			return 0;
		}
		let resolved = 0;
		const openCases = await this.db.query.cases.findMany({
			where: (c, { and: a, eq: e, isNotNull, inArray: inArr }) =>
				a(
					e(c.propertyId, input.propertyId),
					isNotNull(c.closurePredicate),
					inArr(c.status, [...ACTIVE_STATUSES]),
				),
		});

		for (const caseRow of openCases) {
			const pred = caseRow.closurePredicate as CaseClosurePredicate | null;
			if (!pred) continue;

			for (const fact of input.newFacts) {
				if (!factSatisfiesClosurePredicate(fact.key, fact.value, pred)) {
					continue;
				}
				if (
					!scopesAlign(
						{
							propertyId: caseRow.propertyId,
							houseId: caseRow.houseId,
							apartmentId: caseRow.apartmentId,
						},
						fact.scope,
					)
				) {
					continue;
				}
				await this.db
					.update(cases)
					.set({ status: TERMINAL_CASE_STATUS, updatedAt: input.nowIso })
					.where(eq(cases.id, caseRow.id));
				resolved += 1;
				break;
			}
		}
		return resolved;
	}
}

const GENERIC_CASE_KEY_TOKENS = new Set([
	"lie",
	"case",
	"cases",
	"property",
	"apartment",
	"repair",
	"status",
	"issue",
	"open",
	"resolved",
]);

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds fact scope snapshots using link tables (post-insert). */
export async function loadFactScopes(
	db: CaseLifecycleDb,
	factIds: string[],
): Promise<Map<string, ResolvedHierarchyScope>> {
	const map = new Map<string, ResolvedHierarchyScope>();
	if (factIds.length === 0) return map;

	const factRows = await db.query.facts.findMany({
		where: (f, { inArray: inArr }) => inArr(f.id, factIds),
		with: {
			houseLinks: true,
			apartmentLinks: {
				with: {
					apartment: { columns: { houseId: true } },
				},
			},
		},
	});

	for (const row of factRows) {
		const aptLink = row.apartmentLinks[0];
		const apartmentId = aptLink?.apartmentId;
		const houseFromApartment = aptLink?.apartment?.houseId;
		const houseFromLink = row.houseLinks[0]?.houseId;
		const houseId = houseFromApartment ?? houseFromLink;
		const scope: ResolvedHierarchyScope = apartmentId && houseId
			? {
					scopeType: "apartment",
					propertyId: row.propertyId,
					houseId,
					apartmentId,
				}
			: houseId
				? { scopeType: "house", propertyId: row.propertyId, houseId }
				: { scopeType: "property", propertyId: row.propertyId };
		map.set(row.id, scope);
	}
	return map;
}
