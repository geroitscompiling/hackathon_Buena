import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { FactsTable } from "#/components/FactsTable";
import {
	FACTS_OVERVIEW_LOAD_LIMIT,
	countFacts,
	listFacts,
} from "#/services/facts";

const getFactsOverview = createServerFn({
	method: "GET",
}).handler(async () => {
	const total = await countFacts(undefined, {});
	const limit = Math.min(FACTS_OVERVIEW_LOAD_LIMIT, Math.max(total, 1));
	const facts = await listFacts(undefined, { limit });
	return { facts, total };
});

export const Route = createFileRoute("/facts/")({
	component: FactsPage,
	loader: async () => await getFactsOverview(),
});

function FactsPage() {
	const { facts, total } = Route.useLoaderData();

	const headline =
		facts.length < total
			? `${facts.length.toLocaleString()} facts shown (${total.toLocaleString()} total)`
			: `${facts.length.toLocaleString()} facts loaded`;

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5">
				<p className="mb-2 text-sm text-muted-foreground">Facts</p>
				<h1 className="text-2xl font-semibold">{headline}</h1>
				{facts.length < total ? (
					<p className="mt-2 text-sm text-muted-foreground">
						Showing the {facts.length.toLocaleString()} newest rows in this
						view. The full total is {total.toLocaleString()}.
					</p>
				) : null}
			</section>

			<FactsTable facts={facts} />
		</main>
	);
}
