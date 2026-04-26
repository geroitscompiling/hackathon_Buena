/** Safe to import from client routes — no database or Node-only drivers. */

export const SEMANTIC_SEARCH_MAX_RESULTS = 10_000;

export type SemanticSearchResult = {
	entityType: "fact" | "case";
	id: string;
	score: number;
	snippet: string;
	payload: unknown;
};
