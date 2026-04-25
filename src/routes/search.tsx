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
import type { SemanticSearchResult } from "#/services/semanticIndex";

const searchPageSchema = z.object({
	query: z.string().default(""),
	entityType: z.enum(["all", "fact", "case"]).default("all"),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
	limit: z.coerce.number().int().positive().max(50).default(10),
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
	const [limit, setLimit] = useState(String(search.limit));

	useEffect(() => {
		setQuery(search.query);
		setEntityType(search.entityType);
		setPropertyId(search.propertyId ?? "");
		setHouseId(search.houseId ?? "");
		setApartmentId(search.apartmentId ?? "");
		setLimit(String(search.limit));
	}, [
		search.apartmentId,
		search.entityType,
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
						className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
						onSubmit={async (event) => {
							event.preventDefault();
							await navigate({
								to: "/search",
								search: {
									query,
									entityType,
									propertyId: propertyId.trim() || undefined,
									houseId: houseId.trim() || undefined,
									apartmentId: apartmentId.trim() || undefined,
									limit: Number.parseInt(limit, 10) || 10,
								},
							});
						}}
					>
						<div className="xl:col-span-2">
							<label className="mb-2 block text-sm font-medium">Query</label>
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="e.g. open roof leak issues in LIE-001"
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium">Entity Type</label>
							<Select value={entityType} onValueChange={(value) => setEntityType(value as "all" | "fact" | "case")}>
								<SelectTrigger className="w-full">
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
							<label className="mb-2 block text-sm font-medium">Property ID</label>
							<Input value={propertyId} onChange={(event) => setPropertyId(event.target.value)} placeholder="LIE-001" />
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium">House ID</label>
							<Input value={houseId} onChange={(event) => setHouseId(event.target.value)} placeholder="LIE-001-H1" />
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium">Apartment ID</label>
							<Input
								value={apartmentId}
								onChange={(event) => setApartmentId(event.target.value)}
								placeholder="LIE-001-H1-A1"
							/>
						</div>
						<div className="flex items-end gap-3">
							<div className="flex-1">
								<label className="mb-2 block text-sm font-medium">Limit</label>
								<Input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" />
							</div>
							<Button type="submit" className="min-w-28">
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
