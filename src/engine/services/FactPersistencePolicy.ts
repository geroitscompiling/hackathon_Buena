import type { ResolvedHierarchyScope } from "./HierarchyResolver";

export type FactPersistenceRecord = {
	id: string;
	scope: ResolvedHierarchyScope;
	category: string;
	key: string;
	value: string;
	sourceId: string;
	isGoldStandard: boolean;
};

export type IncomingFactCandidate = {
	scope: ResolvedHierarchyScope;
	category: string;
	key: string;
	value: string;
	sourceId: string;
	isGoldStandard: boolean;
};

export type FactPersistenceDecision =
	| {
			outcome: "inserted";
	  }
	| {
			outcome: "blocked_as_conflict";
			reason: "existing_gold_fact_same_semantic_identity";
			conflictWithFactId: string;
			conflictSourceId: string;
	  }
	| {
			outcome: "updated_idempotent";
			matchedFactId: string;
	  };

export type FactPersistenceEvaluationInput = {
	existingFacts: FactPersistenceRecord[];
	incomingFact: IncomingFactCandidate;
};

/**
 * Evaluates whether an incoming fact should be inserted, blocked as conflict,
 * or treated as an idempotent update.
 *
 * Semantic identity is defined as `scope + category + key`.
 */
export class FactPersistencePolicy {
	async evaluate(
		input: FactPersistenceEvaluationInput,
	): Promise<FactPersistenceDecision> {
		const semanticMatch = input.existingFacts.find((existingFact) =>
			this.isSameSemanticIdentity(existingFact, input.incomingFact),
		);

		if (!semanticMatch) {
			return { outcome: "inserted" };
		}

		if (semanticMatch.isGoldStandard && !input.incomingFact.isGoldStandard) {
			return {
				outcome: "blocked_as_conflict",
				reason: "existing_gold_fact_same_semantic_identity",
				conflictWithFactId: semanticMatch.id,
				conflictSourceId: semanticMatch.sourceId,
			};
		}

		return {
			outcome: "updated_idempotent",
			matchedFactId: semanticMatch.id,
		};
	}

	private isSameSemanticIdentity(
		existingFact: FactPersistenceRecord,
		incomingFact: IncomingFactCandidate,
	): boolean {
		return (
			this.serializeScope(existingFact.scope) ===
				this.serializeScope(incomingFact.scope) &&
			existingFact.category === incomingFact.category &&
			existingFact.key === incomingFact.key
		);
	}

	private serializeScope(scope: ResolvedHierarchyScope): string {
		return [
			scope.scopeType,
			scope.propertyId,
			scope.houseId ?? "",
			scope.apartmentId ?? "",
		].join("|");
	}
}
