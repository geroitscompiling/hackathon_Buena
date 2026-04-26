import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import { FactFormDialog } from "#/components/FactFormDialog";
import { FactsTable } from "#/components/FactsTable";
import { Button } from "#/components/ui/button";
import { db } from "#/services/database";
import type { FactListItem } from "#/services/facts";
import { listFactsForScope } from "#/services/facts";
import {
	createHumanFact,
	createHumanFactSchema,
	resolveFactsScopeContext,
	updateHumanFact,
	updateHumanFactSchema,
} from "#/services/humanFacts";
import { listProperties } from "#/services/properties";

const scopePayloadSchema = z.object({
	limit: z.coerce.number().int().positive().max(10_000).default(100),
	scopeId: z.string().trim().min(1),
	scopeType: z.enum(["property", "house", "apartment"]),
});

const getFactsScopePayload = createServerFn({
	method: "GET",
})
	.inputValidator((data) => scopePayloadSchema.parse(data))
	.handler(async ({ data }) => {
		const facts = await listFactsForScope(undefined, {
			limit: data.limit,
			scopeId: data.scopeId,
			scopeType: data.scopeType,
		});
		const scopeContext = await resolveFactsScopeContext(
			db,
			data.scopeType,
			data.scopeId,
		);
		const properties = await listProperties(undefined, { limit: 200 });
		return { facts, scopeContext, properties };
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

export const Route = createFileRoute("/facts/$scopeType/$scopeId")({
	component: FactsScopePage,
	loader: async ({ params }) =>
		await getFactsScopePayload({
			data: {
				limit: 100,
				scopeId: params.scopeId,
				scopeType: params.scopeType as "property" | "house" | "apartment",
			},
		}),
});

function FactsScopePage() {
	const { facts, scopeContext, properties } = Route.useLoaderData();
	const { scopeId, scopeType } = Route.useParams();
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
	const [editingFact, setEditingFact] = useState<FactListItem | null>(null);

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Facts</p>
					<h1 className="text-2xl font-semibold">
						{scopeType[0].toUpperCase() + scopeType.slice(1)}: {scopeId}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{facts.length} linked facts
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
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
					<Link
						to="/"
						className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium no-underline transition hover:bg-accent hover:text-accent-foreground"
					>
						Back to properties
					</Link>
				</div>
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
				scopeDefaults={dialogMode === "create" ? scopeContext : null}
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
