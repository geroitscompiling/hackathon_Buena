import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { SearchResults } from "#/components/SearchResults";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	SEMANTIC_SEARCH_MAX_RESULTS,
	type SemanticSearchResult,
} from "#/services/semanticIndex";

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

export const Route = createFileRoute("/search")({
	validateSearch: (search) => searchPageSchema.parse(search),
	component: SearchPage,
});

function SearchPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const [results, setResults] = useState<SemanticSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
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
				return;
			}

			setIsLoading(true);
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
			if (!response.ok) {
				throw new Error(`Search failed with status ${response.status}`);
			}
			const payload = (await response.json()) as SemanticSearchResult[];
			if (!cancelled) {
				setResults(payload);
				setIsLoading(false);
			}
		}

		loadResults().catch(() => {
			if (!cancelled) {
				setResults([]);
				setIsLoading(false);
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
							await navigate({
								to: "/search",
								search: {
									query,
									entityType,
									goldStandard,
									propertyId: propertyId.trim() || undefined,
									houseId: houseId.trim() || undefined,
									apartmentId: apartmentId.trim() || undefined,
									limit: clampSemanticSearchLimit(limit),
								},
							});
						}}
					>
						<div className="xl:col-span-2">
							<label htmlFor="search-query" className="mb-2 block text-sm font-medium">
								Query
							</label>
							<Input
								id="search-query"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="e.g. open roof leak issues in LIE-001"
							/>
						</div>
						<div>
							<label htmlFor="search-entity-type" className="mb-2 block text-sm font-medium">
								Entity Type
							</label>
							<Select value={entityType} onValueChange={(value) => setEntityType(value as "all" | "fact" | "case")}>
								<SelectTrigger id="search-entity-type" className="w-full">
									<SelectValue placeholder="All entities" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All entities</SelectItem>
									<SelectItem value="fact">Facts only</SelectItem>
									<SelectItem value="case">Cases only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<label htmlFor="search-gold" className="mb-2 block text-sm font-medium">
								Gold standard (facts)
							</label>
							<Select
								value={goldStandard}
								onValueChange={(value) =>
									setGoldStandard(value as "all" | "gold" | "nonGold")
								}
							>
								<SelectTrigger id="search-gold" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All facts</SelectItem>
									<SelectItem value="gold">Gold (ERP JSON / CSV)</SelectItem>
									<SelectItem value="nonGold">Non-gold (extracted)</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div>
							<label htmlFor="search-property-id" className="mb-2 block text-sm font-medium">
								Property ID
							</label>
							<Input
								id="search-property-id"
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
									value={limit}
									onChange={(event) => setLimit(event.target.value)}
									inputMode="numeric"
									placeholder={`max ${SEMANTIC_SEARCH_MAX_RESULTS.toLocaleString()}`}
									aria-describedby="search-limit-hint"
								/>
								<p id="search-limit-hint" className="mt-1 text-xs text-muted-foreground">
									Capped at {SEMANTIC_SEARCH_MAX_RESULTS.toLocaleString()} per search.
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
						{isLoading ? "Searching..." : `${results.length} matches`}
					</h2>
				</div>
			</section>

			<SearchResults results={results} query={search.query} />
		</main>
	);
}
