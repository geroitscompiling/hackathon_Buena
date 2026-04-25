import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { FactsTable } from "#/components/FactsTable";
import { listFactsForScope, listFactsForScopeSchema } from "#/services/facts";

const getFactsForScope = createServerFn({
	method: "GET",
})
	.inputValidator((data) => listFactsForScopeSchema.parse(data))
	.handler(async ({ data }) => {
		return listFactsForScope(undefined, data);
	});

export const Route = createFileRoute("/facts/$scopeType/$scopeId")({
	component: FactsScopePage,
	loader: async ({ params }) =>
		await getFactsForScope({
			data: {
				limit: 100,
				scopeId: params.scopeId,
				scopeType: params.scopeType as "property" | "house" | "apartment",
			},
		}),
});

function FactsScopePage() {
	const facts = Route.useLoaderData();
	const { scopeId, scopeType } = Route.useParams();

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
				<Link
					to="/"
					className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium no-underline transition hover:bg-accent hover:text-accent-foreground"
				>
					Back to properties
				</Link>
			</section>

			<FactsTable facts={facts} />
		</main>
	);
}
