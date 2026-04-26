import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { CasesTable } from "#/components/CasesTable";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import {
	CASES_OVERVIEW_LOAD_LIMIT,
	casesOverviewFilterInputSchema,
	normalizeCasesOverviewFilters,
} from "#/services/casesOverviewFilters";
import {
	CASE_STATUS_ALL,
	buildCasesSearchFromFormFields,
	type CasesPageSearch,
	casesPageSearchSchema,
} from "#/services/casesPageSearch";

const CASE_STATUS_OPTIONS = [
	{ value: CASE_STATUS_ALL, label: "All statuses" },
	{ value: "open", label: "Open" },
	{ value: "in_progress", label: "In progress" },
	{ value: "investigating", label: "Investigating" },
	{ value: "blocked", label: "Blocked" },
	{ value: "on_hold", label: "On hold" },
	{ value: "resolved", label: "Resolved" },
] as const;

const fetchCasesOverview = createServerFn({ method: "POST" })
	.inputValidator((data) => casesOverviewFilterInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { countCases, listCases } = await import("#/services/cases");
		const filters = normalizeCasesOverviewFilters(data);
		const total = await countCases(undefined, filters);
		const limit = Math.min(CASES_OVERVIEW_LOAD_LIMIT, Math.max(total, 1));
		const cases = await listCases(undefined, { ...filters, limit });
		return { cases, total };
	});

export const Route = createFileRoute("/cases/")({
	validateSearch: (search) => casesPageSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ location }) => {
		const s = location.search as CasesPageSearch;
		return fetchCasesOverview({
			data: {
				apartmentId: s.apartmentId?.trim() || undefined,
				houseId: s.houseId?.trim() || undefined,
				propertyId: s.propertyId?.trim() || undefined,
				q: s.q?.trim() || undefined,
				status: s.status?.trim() || undefined,
			},
		});
	},
	component: CasesPage,
});

function CasesPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const { cases, total } = Route.useLoaderData();

	const [q, setQ] = useState(search.q);
	const [status, setStatus] = useState(
		search.status && search.status.trim() !== ""
			? search.status
			: CASE_STATUS_ALL,
	);
	const [propertyId, setPropertyId] = useState(search.propertyId ?? "");
	const [houseId, setHouseId] = useState(search.houseId ?? "");
	const [apartmentId, setApartmentId] = useState(search.apartmentId ?? "");

	useEffect(() => {
		setQ(search.q);
		setStatus(
			search.status && search.status.trim() !== ""
				? search.status
				: CASE_STATUS_ALL,
		);
		setPropertyId(search.propertyId ?? "");
		setHouseId(search.houseId ?? "");
		setApartmentId(search.apartmentId ?? "");
	}, [
		search.apartmentId,
		search.houseId,
		search.propertyId,
		search.q,
		search.status,
	]);

	const hasActiveFilters = Boolean(
		search.q.trim() ||
			search.status?.trim() ||
			search.propertyId?.trim() ||
			search.houseId?.trim() ||
			search.apartmentId?.trim(),
	);

	const headline =
		cases.length < total
			? `${cases.length.toLocaleString()} cases shown (${total.toLocaleString()} matching)`
			: `${cases.length.toLocaleString()} cases loaded`;

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Cases</p>
					<h1 className="text-2xl font-semibold">{headline}</h1>
					{cases.length < total ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Showing the {cases.length.toLocaleString()} most recently updated
							rows in this view. There are {total.toLocaleString()} matches in
							total.
						</p>
					) : null}
					{hasActiveFilters ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Filters narrow the list. Clear them to see all cases.
						</p>
					) : null}
				</div>
			</section>

			<Card className="mb-6 py-0">
				<CardContent className="py-6">
					<form
						className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
						onSubmit={async (event) => {
							event.preventDefault();
							const form = event.currentTarget;
							const fd = new FormData(form);
							const search = buildCasesSearchFromFormFields({
								apartmentId: String(fd.get("apartmentId") ?? ""),
								houseId: String(fd.get("houseId") ?? ""),
								propertyId: String(fd.get("propertyId") ?? ""),
								q: String(fd.get("q") ?? ""),
								status: String(fd.get("status") ?? CASE_STATUS_ALL),
							});
							await navigate({
								to: "/cases",
								search,
							});
						}}
					>
						<div className="xl:col-span-2">
							<label htmlFor="cases-q" className="mb-2 block text-sm font-medium">
								Search text
							</label>
							<Input
								id="cases-q"
								name="q"
								value={q}
								onChange={(event) => setQ(event.target.value)}
								placeholder="Title, summary, case key, id..."
							/>
						</div>
						<div className="min-w-0">
							<label htmlFor="cases-status" className="mb-2 block text-sm font-medium">
								Status
							</label>
							<select
								id="cases-status"
								name="status"
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className={cn(
									"h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
									"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
									"disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
								)}
							>
								{CASE_STATUS_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label
								htmlFor="cases-property-id"
								className="mb-2 block text-sm font-medium"
							>
								Property ID
							</label>
							<Input
								id="cases-property-id"
								name="propertyId"
								value={propertyId}
								onChange={(event) => setPropertyId(event.target.value)}
								placeholder="LIE-001"
							/>
						</div>
						<div>
							<label htmlFor="cases-house-id" className="mb-2 block text-sm font-medium">
								House ID
							</label>
							<Input
								id="cases-house-id"
								name="houseId"
								value={houseId}
								onChange={(event) => setHouseId(event.target.value)}
								placeholder="LIE-001-H1"
							/>
						</div>
						<div>
							<label
								htmlFor="cases-apartment-id"
								className="mb-2 block text-sm font-medium"
							>
								Apartment ID
							</label>
							<Input
								id="cases-apartment-id"
								name="apartmentId"
								value={apartmentId}
								onChange={(event) => setApartmentId(event.target.value)}
								placeholder="LIE-001-H1-A1"
							/>
						</div>
						<div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-6">
							<Button type="submit">Apply filters</Button>
							<Button
								type="button"
								variant="outline"
								onClick={async () => {
									setQ("");
									setStatus(CASE_STATUS_ALL);
									setPropertyId("");
									setHouseId("");
									setApartmentId("");
									await navigate({
										to: "/cases",
										search: buildCasesSearchFromFormFields({
											apartmentId: "",
											houseId: "",
											propertyId: "",
											q: "",
											status: CASE_STATUS_ALL,
										}),
									});
								}}
							>
								Clear
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<CasesTable cases={cases} />
		</main>
	);
}
