import { Badge } from "#/components/ui/badge";
import { formatIntegerGrouped } from "#/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import type {
	SearchIndexStats,
	SemanticSearchResult,
} from "#/services/semanticSearchShared";

type SearchResultsProps = {
	results: SemanticSearchResult[];
	query: string;
	entityType: "all" | "fact" | "case";
	indexStats: SearchIndexStats | null;
};

function formatScore(score: number): string {
	return `${Math.round(score * 100)}%`;
}

function embeddingGapMessage(
	entityType: "all" | "fact" | "case",
	stats: SearchIndexStats,
): string | null {
	const factGap =
		stats.factsTotal > 0 && stats.factsIndexed === 0
			? `${formatIntegerGrouped(stats.factsTotal)} facts in the database, ${formatIntegerGrouped(stats.factsIndexed)} in the vector index`
			: null;
	const caseGap =
		stats.casesTotal > 0 && stats.casesIndexed === 0
			? `${formatIntegerGrouped(stats.casesTotal)} cases in the database, ${formatIntegerGrouped(stats.casesIndexed)} in the vector index`
			: null;

	if (entityType === "fact") {
		return factGap;
	}
	if (entityType === "case") {
		return caseGap;
	}
	if (factGap && caseGap) {
		return `${factGap}; ${caseGap}`;
	}
	return factGap ?? caseGap ?? null;
}

export function SearchResults({ results, query, entityType, indexStats }: SearchResultsProps) {
	if (!query.trim()) {
		return (
			<div className="rounded-lg border border-dashed bg-card px-6 py-8 text-sm text-muted-foreground">
				Type a query above and click Search. Results use the URL query (same as the address bar).
			</div>
		);
	}

	if (results.length === 0) {
		const gap = indexStats ? embeddingGapMessage(entityType, indexStats) : null;
		return (
			<div className="space-y-3 rounded-lg border border-dashed bg-card px-6 py-8 text-sm text-muted-foreground">
				<p>
					No semantic matches found for{" "}
					<span className="font-medium text-foreground">{query}</span>.
				</p>
				{gap ? (
					<p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-100">
						<strong className="font-medium">Vector index is empty for your data:</strong> {gap}.
						Set <code className="rounded bg-muted px-1.5 py-0.5">GEMINI_API_KEY</code> and{" "}
						<code className="rounded bg-muted px-1.5 py-0.5">GEMINI_MODEL_EMBEDDING</code>, then run{" "}
						<code className="rounded bg-muted px-1.5 py-0.5">pnpm embeddings:backfill</code> (same{" "}
						<code className="rounded bg-muted px-1.5 py-0.5">DATABASE_URL</code> as the app).
					</p>
				) : (
					<p>
						If you expected hits, try a broader phrase or clear property filters. Rows without embeddings
						are excluded; run{" "}
						<code className="rounded bg-muted px-1.5 py-0.5">pnpm embeddings:backfill</code> if the
						index may be incomplete.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="grid gap-4">
			{results.map((result) => (
				<Card key={`${result.entityType}-${result.id}`} className="gap-4 py-0">
					<CardHeader className="border-b py-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={result.entityType === "fact" ? "secondary" : "default"}>
										{result.entityType}
									</Badge>
									<Badge variant="outline">{formatScore(result.score)}</Badge>
								</div>
								<CardTitle className="text-base">{result.snippet}</CardTitle>
								<CardDescription>{result.id}</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="pb-5">
						<pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm leading-6 text-foreground">
							{JSON.stringify(result.payload, null, 2)}
						</pre>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
