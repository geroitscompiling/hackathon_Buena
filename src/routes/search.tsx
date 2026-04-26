import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SearchResults } from "#/components/SearchResults";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { cn, formatIntegerGrouped } from "#/lib/utils";
import {
	SEMANTIC_SEARCH_MAX_RESULTS,
	type SearchIndexStats,
	type SemanticSearchResult,
} from "#/services/semanticSearchShared";

function parseIndexStats(response: Response): SearchIndexStats {
	return {
		factsIndexed: Number.parseInt(
			response.headers.get("X-Search-Index-Facts") ?? "0",
			10,
		),
		casesIndexed: Number.parseInt(
			response.headers.get("X-Search-Index-Cases") ?? "0",
			10,
		),
		factsTotal: Number.parseInt(response.headers.get("X-Search-Total-Facts") ?? "0", 10),
		casesTotal: Number.parseInt(response.headers.get("X-Search-Total-Cases") ?? "0", 10),
	};
}

const ENTITY_TYPE_OPTIONS = [
	{ value: "all" as const, label: "All entities" },
	{ value: "fact" as const, label: "Facts only" },
	{ value: "case" as const, label: "Cases only" },
];

const GOLD_STANDARD_OPTIONS = [
	{ value: "all" as const, label: "All facts" },
	{ value: "gold" as const, label: "Gold (ERP JSON / CSV)" },
	{ value: "nonGold" as const, label: "Non-gold (extracted)" },
];

function clampSemanticSearchLimit(val: unknown): number {
	const raw =
		typeof val === "number" ? val : Number.parseInt(String(val ?? ""), 10);
	if (!Number.isFinite(raw) || raw < 1) {
		return 10;
	}
	return Math.min(Math.floor(raw), SEMANTIC_SEARCH_MAX_RESULTS);
}

const searchPageSchema = z.object({
	query: z.string().default(""),
	entityType: z.enum(["all", "fact", "case"]).default("all"),
	goldStandard: z.enum(["all", "gold", "nonGold"]).default("all"),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
	limit: z.preprocess(clampSemanticSearchLimit, z.number().int().positive()),
});

type SearchPageSearch = z.infer<typeof searchPageSchema>;

/** Reads raw form strings and validates (single source of truth for URL search). */
function parseSearchForm(fd: FormData): SearchPageSearch {
	return searchPageSchema.parse({
		query: String(fd.get("query") ?? ""),
		entityType: String(fd.get("entityType") ?? "all"),
		goldStandard: String(fd.get("goldStandard") ?? "all"),
		propertyId: String(fd.get("propertyId") ?? "").trim() || undefined,
		houseId: String(fd.get("houseId") ?? "").trim() || undefined,
		apartmentId: String(fd.get("apartmentId") ?? "").trim() || undefined,
		limit: clampSemanticSearchLimit(fd.get("limit")),
	});
}

export const Route = createFileRoute("/search")({
	validateSearch: (search) => searchPageSchema.parse(search),
	component: SearchPage,
});

function SearchPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [results, setResults] = useState<SemanticSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [indexStats, setIndexStats] = useState<SearchIndexStats | null>(null);
	const [query, setQuery] = useState(search.query);
	const [entityType, setEntityType] = useState(search.entityType);
	const [propertyId, setPropertyId] = useState(search.propertyId ?? "");
	const [houseId, setHouseId] = useState(search.houseId ?? "");
	const [apartmentId, setApartmentId] = useState(search.apartmentId ?? "");
	const [goldStandard, setGoldStandard] = useState(search.goldStandard);
	const [limit, setLimit] = useState(String(search.limit));

	useEffect(() => {
		setQuery(search.query);
		setEntityType(search.entityType);
		setGoldStandard(search.goldStandard);
		setPropertyId(search.propertyId ?? "");
		setHouseId(search.houseId ?? "");
		setApartmentId(search.apartmentId ?? "");
		setLimit(String(search.limit));
	}, [
		search.apartmentId,
		search.entityType,
		search.goldStandard,
		search.houseId,
		search.limit,
		search.propertyId,
		search.query,
	]);

	useEffect(() => {
		let cancelled = false;

		async function loadResults() {
			if (!search.query.trim()) {
				setResults([]);
				setSearchError(null);
				setIndexStats(null);
				setIsLoading(false);
				return;
			}

			setIsLoading(true);
			setSearchError(null);
			const params = new URLSearchParams({
				query: search.query,
				entityType: search.entityType,
				goldStandard: search.goldStandard,
				limit: String(search.limit),
			});
			if (search.propertyId) params.set("propertyId", search.propertyId);
			if (search.houseId) params.set("houseId", search.houseId);
			if (search.apartmentId) params.set("apartmentId", search.apartmentId);

			const response = await fetch(`/api/search?${params.toString()}`);
			const stats = parseIndexStats(response);
			const payload = await response.json();
			if (!response.ok) {
				if (!cancelled) {
					setIndexStats(stats);
				}
				const body = payload as { error?: string };
				throw new Error(
					typeof body.error === "string" ? body.error : `Search failed (${response.status})`,
				);
			}
			if (!cancelled) {
				setResults(payload as SemanticSearchResult[]);
				setIndexStats(stats);
				setIsLoading(false);
			}
		}

		loadResults().catch((err: unknown) => {
			if (!cancelled) {
				setResults([]);
				setIsLoading(false);
				setSearchError(err instanceof Error ? err.message : "Search failed");
			}
		});

		return () => {
			cancelled = true;
		};
	}, [
		search.apartmentId,
		search.entityType,
		search.goldStandard,
		search.houseId,
		search.limit,
		search.propertyId,
		search.query,
	]);

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-6">
				<p className="mb-2 text-sm text-muted-foreground">Semantic Search</p>
				<h1 className="text-2xl font-semibold">Search facts and cases with natural language</h1>
				<p className="mt-2 max-w-2xl text-sm text-muted-foreground">
					Query the vector index across facts and cases, then narrow by entity type or scope when needed.
				</p>
			</section>

			<Card className="mb-6 py-0">
				<CardContent className="py-6">
					<form
						className="grid gap-4 md:grid-cols-2 xl:grid-cols-7"
						onSubmit={async (event) => {
							event.preventDefault();
							const fd = new FormData(event.currentTarget);
							await navigate({
								to: "/search",
								search: parseSearchForm(fd),
							});
						}}
					>
						<div className="xl:col-span-2">
							<label htmlFor="search-query" className="mb-2 block text-sm font-medium">
								Query
							</label>
							<Input
								id="search-query"
								name="query"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="e.g. open roof leak issues in LIE-001"
							/>
						</div>
						<div className="min-w-0">
							<label htmlFor="search-entity-type" className="mb-2 block text-sm font-medium">
								Entity Type
							</label>
							<select
								id="search-entity-type"
								name="entityType"
								value={entityType}
								onChange={(event) =>
									setEntityType(event.target.value as "all" | "fact" | "case")
								}
								className={cn(
									"h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
									"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
									"disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
								)}
							>
								{ENTITY_TYPE_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
						<div className="min-w-0">
							<label htmlFor="search-gold" className="mb-2 block text-sm font-medium">
								Gold standard (facts)
							</label>
							<select
								id="search-gold"
								name="goldStandard"
								value={goldStandard}
								onChange={(event) =>
									setGoldStandard(event.target.value as "all" | "gold" | "nonGold")
								}
								className={cn(
									"h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
									"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
									"disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
								)}
							>
								{GOLD_STANDARD_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label htmlFor="search-property-id" className="mb-2 block text-sm font-medium">
								Property ID
							</label>
							<Input
								id="search-property-id"
								name="propertyId"
								value={propertyId}
								onChange={(event) => setPropertyId(event.target.value)}
								placeholder="LIE-001"
							/>
						</div>
						<div>
							<label htmlFor="search-house-id" className="mb-2 block text-sm font-medium">
								House ID
							</label>
							<Input
								id="search-house-id"
								name="houseId"
								value={houseId}
								onChange={(event) => setHouseId(event.target.value)}
								placeholder="LIE-001-H1"
							/>
						</div>
						<div>
							<label htmlFor="search-apartment-id" className="mb-2 block text-sm font-medium">
								Apartment ID
							</label>
							<Input
								id="search-apartment-id"
								name="apartmentId"
								value={apartmentId}
								onChange={(event) => setApartmentId(event.target.value)}
								placeholder="LIE-001-H1-A1"
							/>
						</div>
						<div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-7">
							<div className="w-full min-w-[12rem] sm:w-auto sm:max-w-[14rem]">
								<label htmlFor="search-limit" className="mb-2 block text-sm font-medium">
									Results limit
								</label>
								<Input
									id="search-limit"
									name="limit"
									value={limit}
									onChange={(event) => setLimit(event.target.value)}
									inputMode="numeric"
									placeholder={`max ${formatIntegerGrouped(SEMANTIC_SEARCH_MAX_RESULTS)}`}
									aria-describedby="search-limit-hint"
								/>
								<p id="search-limit-hint" className="mt-1 text-xs text-muted-foreground">
									Capped at {formatIntegerGrouped(SEMANTIC_SEARCH_MAX_RESULTS)} per search.
								</p>
							</div>
							<Button type="submit" className="min-w-28 shrink-0">
								Search
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<section className="mb-4 flex items-center justify-between gap-4">
				<div>
					<p className="text-sm text-muted-foreground">Results</p>
					<h2 className="text-xl font-semibold">
						{!search.query.trim()
							? "Submit a query to search"
							: isLoading
								? "Searching..."
								: `${results.length} matches`}
					</h2>
					{searchError ? (
						<p className="mt-2 text-sm text-destructive" role="alert">
							{searchError}
						</p>
					) : null}
				</div>
			</section>

			<SearchResults
				results={results}
				query={search.query}
				entityType={search.entityType}
				indexStats={indexStats}
			/>
		</main>
	);
}
