import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { FactFormDialog } from "#/components/FactFormDialog";
import { FactsTable } from "#/components/FactsTable";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { cn } from "#/lib/utils";
import { db } from "#/services/database";
import type { FactListItem } from "#/services/facts";
import {
	factsOverviewFilterInputSchema,
	normalizeFactsOverviewFilters,
} from "#/services/factsOverviewFilters";
import {
	FACT_CATEGORY_ALL,
	type FactsPageSearch,
	buildFactsSearchFromFormFields,
	factsPageSearchSchema,
} from "#/services/factsPageSearch";
import {
	createHumanFact,
	createHumanFactSchema,
	updateHumanFact,
	updateHumanFactSchema,
} from "#/services/humanFacts";

const FACT_CATEGORY_OPTIONS = [
	{ value: FACT_CATEGORY_ALL, label: "All categories" },
	{ value: "core_erp", label: "Core ERP" },
	{ value: "financial", label: "Financial" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "governance", label: "Governance" },
] as const;

const GOLD_STANDARD_OPTIONS = [
	{ value: "all", label: "All facts" },
	{ value: "gold", label: "Gold (ERP) only" },
	{ value: "nonGold", label: "Non-gold only" },
] as const;

/** DB runs only on the server — avoids `Buffer` / driver code in the browser on client navigations. */
const fetchFactsOverview = createServerFn({ method: "POST" })
	.inputValidator((data) => factsOverviewFilterInputSchema.parse(data))
	.handler(async ({ data }) => {
		const { FACTS_OVERVIEW_LOAD_LIMIT, countFacts, listFacts } = await import(
			"#/services/facts"
		);
		const filters = normalizeFactsOverviewFilters(data);
		const total = await countFacts(undefined, filters);
		const limit = Math.min(FACTS_OVERVIEW_LOAD_LIMIT, Math.max(total, 1));
		const facts = await listFacts(undefined, { ...filters, limit });
		const { listProperties } = await import("#/services/properties");
		const properties = await listProperties(undefined, { limit: 100 });
		return { facts, total, properties };
	});

const createHumanFactAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => createHumanFactSchema.parse(data))
	.handler(async ({ data }) => {
		await createHumanFact(db, data);
	});

const updateHumanFactAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => updateHumanFactSchema.parse(data))
	.handler(async ({ data }) => {
		await updateHumanFact(db, data);
	});

export const Route = createFileRoute("/facts/")({
	validateSearch: (search) => factsPageSearchSchema.parse(search),
	loaderDeps: ({ search }) => search,
	loader: async ({ location }) => {
		const s = location.search as FactsPageSearch;
		return fetchFactsOverview({
			data: {
				apartmentId: s.apartmentId?.trim() || undefined,
				category: s.category?.trim() || undefined,
				goldStandard: s.goldStandard?.trim() || undefined,
				houseId: s.houseId?.trim() || undefined,
				propertyId: s.propertyId?.trim() || undefined,
				q: s.q?.trim() || undefined,
			},
		});
	},
	component: FactsPage,
});

function FactsPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();
	const { facts, total, properties } = Route.useLoaderData();

	const [q, setQ] = useState(search.q);
	const [category, setCategory] = useState(
		search.category && search.category.trim() !== "" ?
			search.category
		:	FACT_CATEGORY_ALL,
	);
	const [goldStandard, setGoldStandard] = useState(search.goldStandard ?? "all");
	const [propertyId, setPropertyId] = useState(search.propertyId ?? "");
	const [houseId, setHouseId] = useState(search.houseId ?? "");
	const [apartmentId, setApartmentId] = useState(search.apartmentId ?? "");

	useEffect(() => {
		setQ(search.q);
		setCategory(
			search.category && search.category.trim() !== "" ?
				search.category
			:	FACT_CATEGORY_ALL,
		);
		setGoldStandard(search.goldStandard ?? "all");
		setPropertyId(search.propertyId ?? "");
		setHouseId(search.houseId ?? "");
		setApartmentId(search.apartmentId ?? "");
	}, [
		search.apartmentId,
		search.category,
		search.goldStandard,
		search.houseId,
		search.propertyId,
		search.q,
	]);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
	const [editingFact, setEditingFact] = useState<FactListItem | null>(null);

	const hasActiveFilters = Boolean(
		search.q.trim() ||
			search.category?.trim() ||
			(search.goldStandard && search.goldStandard !== "all") ||
			search.propertyId?.trim() ||
			search.houseId?.trim() ||
			search.apartmentId?.trim(),
	);

	const headline =
		facts.length < total
			? `${facts.length.toLocaleString()} facts shown (${total.toLocaleString()} matching)`
			: `${facts.length.toLocaleString()} facts loaded`;

	return (
		<main className="min-w-0 max-w-full px-4 py-6 md:px-6">
			<section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Facts</p>
					<h1 className="text-2xl font-semibold">{headline}</h1>
					{facts.length < total ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Showing the {facts.length.toLocaleString()} newest rows in this
							view. There are {total.toLocaleString()} matches in total.
						</p>
					) : null}
					{hasActiveFilters ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Filters narrow the list. Clear them to see all facts.
						</p>
					) : null}
					<p className="mt-2 text-sm text-muted-foreground">
						Add a manual fact with the button on the right, or edit a row via
						Actions.
					</p>
				</div>
				<Button
					type="button"
					onClick={() => {
						setDialogMode("create");
						setEditingFact(null);
						setDialogOpen(true);
					}}
				>
					Add fact
				</Button>
			</section>

			<Card className="mb-6 py-0">
				<CardContent className="py-6">
					<form
						className="grid gap-4 md:grid-cols-2 xl:grid-cols-7"
						onSubmit={async (event) => {
							event.preventDefault();
							const form = event.currentTarget;
							const fd = new FormData(form);
							const nextSearch = buildFactsSearchFromFormFields({
								apartmentId: String(fd.get("apartmentId") ?? ""),
								category: String(fd.get("category") ?? FACT_CATEGORY_ALL),
								goldStandard: String(fd.get("goldStandard") ?? "all"),
								houseId: String(fd.get("houseId") ?? ""),
								propertyId: String(fd.get("propertyId") ?? ""),
								q: String(fd.get("q") ?? ""),
							});
							await navigate({
								to: "/facts",
								search: nextSearch,
							});
						}}
					>
						<div className="md:col-span-2 xl:col-span-2">
							<label htmlFor="facts-q" className="mb-2 block text-sm font-medium">
								Search text
							</label>
							<Input
								id="facts-q"
								name="q"
								value={q}
								onChange={(event) => setQ(event.target.value)}
								placeholder="Topic, value, id, property name, source file…"
							/>
						</div>
						<div className="min-w-0">
							<label
								htmlFor="facts-category"
								className="mb-2 block text-sm font-medium"
							>
								Category
							</label>
							<select
								id="facts-category"
								name="category"
								value={category}
								onChange={(event) => setCategory(event.target.value)}
								className={cn(
									"h-9 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none",
									"focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
									"disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
								)}
							>
								{FACT_CATEGORY_OPTIONS.map((opt) => (
									<option key={opt.value} value={opt.value}>
										{opt.label}
									</option>
								))}
							</select>
						</div>
						<div className="min-w-0">
							<label
								htmlFor="facts-gold"
								className="mb-2 block text-sm font-medium"
							>
								Gold standard
							</label>
							<select
								id="facts-gold"
								name="goldStandard"
								value={goldStandard}
								onChange={(event) => setGoldStandard(event.target.value)}
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
							<label
								htmlFor="facts-property-id"
								className="mb-2 block text-sm font-medium"
							>
								Property ID
							</label>
							<Input
								id="facts-property-id"
								name="propertyId"
								value={propertyId}
								onChange={(event) => setPropertyId(event.target.value)}
								placeholder="LIE-001"
							/>
						</div>
						<div>
							<label htmlFor="facts-house-id" className="mb-2 block text-sm font-medium">
								House ID
							</label>
							<Input
								id="facts-house-id"
								name="houseId"
								value={houseId}
								onChange={(event) => setHouseId(event.target.value)}
								placeholder="LIE-001-H1"
							/>
						</div>
						<div>
							<label
								htmlFor="facts-apartment-id"
								className="mb-2 block text-sm font-medium"
							>
								Apartment ID
							</label>
							<Input
								id="facts-apartment-id"
								name="apartmentId"
								value={apartmentId}
								onChange={(event) => setApartmentId(event.target.value)}
								placeholder="LIE-001-H1-A1"
							/>
						</div>
						<div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-7">
							<Button type="submit">Apply filters</Button>
							<Button
								type="button"
								variant="outline"
								onClick={async () => {
									setQ("");
									setCategory(FACT_CATEGORY_ALL);
									setGoldStandard("all");
									setPropertyId("");
									setHouseId("");
									setApartmentId("");
									await navigate({
										to: "/facts",
										search: buildFactsSearchFromFormFields({
											apartmentId: "",
											category: FACT_CATEGORY_ALL,
											goldStandard: "all",
											houseId: "",
											propertyId: "",
											q: "",
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

			<FactsTable
				facts={facts}
				onEditFact={(fact) => {
					setEditingFact(fact);
					setDialogMode("edit");
					setDialogOpen(true);
				}}
			/>

			<FactFormDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				mode={dialogMode}
				properties={properties}
				scopeDefaults={null}
				editingFact={editingFact}
				onCreate={async (args) => {
					await createHumanFactAction({ data: args });
					await router.invalidate();
				}}
				onUpdate={async (args) => {
					await updateHumanFactAction({ data: args });
					await router.invalidate();
				}}
			/>
		</main>
	);
}
