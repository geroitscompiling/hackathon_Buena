import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import type { SemanticSearchResult } from "#/services/semanticSearchShared";

type SearchResultsProps = {
	results: SemanticSearchResult[];
	query: string;
};

function formatScore(score: number): string {
	return `${Math.round(score * 100)}%`;
}

export function SearchResults({ results, query }: SearchResultsProps) {
	if (!query.trim()) {
		return (
			<div className="rounded-lg border border-dashed bg-card px-6 py-8 text-sm text-muted-foreground">
				Enter a natural-language query to search facts and cases.
			</div>
		);
	}

	if (results.length === 0) {
		return (
			<div className="space-y-3 rounded-lg border border-dashed bg-card px-6 py-8 text-sm text-muted-foreground">
				<p>
					No semantic matches found for{" "}
					<span className="font-medium text-foreground">{query}</span>.
				</p>
				<p>
					Vector search only includes rows that already have embeddings. Load data with Gemini
					embedding env set, or run <code className="rounded bg-muted px-1.5 py-0.5">pnpm embeddings:backfill</code>{" "}
					against your database.
				</p>
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
