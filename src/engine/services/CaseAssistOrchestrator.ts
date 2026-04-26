import type { db as appDb } from "#/db";
import { createMcpTools } from "#/mcp/server";
import type { EmbeddingClient } from "#/services/semanticIndex";
import { factValueImpliesClosure, type CaseLifecycleService, type GuardedClosureResult } from "./CaseLifecycleService";

type CaseAssistDb = typeof appDb;

type CaseContextBundle = {
	case: {
		id: string;
		closurePredicate?: string | null;
	};
	relatedCases: unknown[];
	relatedFacts: Array<{
		payload?: {
			key?: string;
			value?: string;
		};
	}>;
};

export type CaseAssistRecommendation = {
	proposedAction: "close_case" | "keep_open";
	confidence: number;
	why: string;
};

export type CaseAssistRunResult = {
	bundle: CaseContextBundle;
	recommendation: CaseAssistRecommendation;
	guardrailResult?: GuardedClosureResult;
};

export class CaseAssistOrchestrator {
	constructor(
		private readonly db: CaseAssistDb,
		private readonly lifecycle: Pick<CaseLifecycleService, "evaluateGuardedClosureAction">,
		private readonly options: { embeddingClient?: EmbeddingClient } = {},
	) {}

	async run(input: {
		caseId: string;
		propertyId: string;
		confidenceThreshold: number;
		nowIso: string;
	}): Promise<CaseAssistRunResult> {
		const tools = createMcpTools(this.db as never, {
			embeddingClient: this.options.embeddingClient,
		});
		const bundleTool = tools.find((tool) => tool.name === "get_case_context_bundle");
		if (!bundleTool) {
			throw new Error("MCP tool get_case_context_bundle is unavailable.");
		}
		const bundle = (await bundleTool.execute({
			caseId: input.caseId,
			relatedCasesLimit: 5,
			relatedFactsLimit: 5,
		})) as CaseContextBundle;

		const predicate = bundle.case.closurePredicate ?? null;
		const matchingEvidence =
			predicate === null
				? []
				: bundle.relatedFacts.filter((result) => {
						const key = result.payload?.key;
						const value = result.payload?.value;
						return key === predicate && typeof value === "string" && factValueImpliesClosure(value);
					});
		const recommendation: CaseAssistRecommendation =
			predicate && matchingEvidence.length > 0
				? {
						proposedAction: "close_case",
						confidence: 0.9,
						why: `Closure predicate ${predicate} has supporting evidence.`,
					}
				: {
						proposedAction: "keep_open",
						confidence: 0.6,
						why: "No reliable closure evidence found in related context.",
					};

		if (recommendation.proposedAction !== "close_case") {
			return {
				bundle,
				recommendation,
			};
		}

		const guardrailResult = await this.lifecycle.evaluateGuardedClosureAction({
			caseId: input.caseId,
			propertyId: input.propertyId,
			proposedAction: "close_case",
			proposedConfidence: recommendation.confidence,
			confidenceThreshold: input.confidenceThreshold,
			nowIso: input.nowIso,
			contextSummary: recommendation.why,
		});

		return {
			bundle,
			recommendation,
			guardrailResult,
		};
	}
}
