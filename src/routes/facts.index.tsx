import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FactFormDialog } from "#/components/FactFormDialog";
import { FactsTable } from "#/components/FactsTable";
import { Button } from "#/components/ui/button";
import {
	FACTS_OVERVIEW_LOAD_LIMIT,
	countFacts,
	listFacts,
} from "#/services/facts";
import {
	createHumanFact,
	createHumanFactSchema,
	updateHumanFact,
	updateHumanFactSchema,
} from "#/services/humanFacts";
import { db } from "#/services/database";
import { listProperties } from "#/services/properties";
import type { FactListItem } from "#/services/facts";

const getFactsOverview = createServerFn({
	method: "GET",
}).handler(async () => {
	const total = await countFacts(undefined, {});
	const limit = Math.min(FACTS_OVERVIEW_LOAD_LIMIT, Math.max(total, 1));
	const facts = await listFacts(undefined, { limit });
	const properties = await listProperties(undefined, { limit: 200 });
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
	component: FactsPage,
	loader: async () => await getFactsOverview(),
});

function FactsPage() {
	const { facts, total, properties } = Route.useLoaderData();
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
	const [editingFact, setEditingFact] = useState<FactListItem | null>(null);

	const headline =
		facts.length < total
			? `${facts.length.toLocaleString()} facts shown (${total.toLocaleString()} total)`
			: `${facts.length.toLocaleString()} facts loaded`;

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Facts</p>
					<h1 className="text-2xl font-semibold">{headline}</h1>
					{facts.length < total ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Showing the {facts.length.toLocaleString()} newest rows in this
							view. The full total is {total.toLocaleString()}.
						</p>
					) : null}
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
