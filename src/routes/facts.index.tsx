import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { FactsTable } from "#/components/FactsTable";
import { listFacts } from "#/services/facts";

const getFacts = createServerFn({
	method: "GET",
}).handler(async () => {
	return listFacts(undefined, {
		limit: 100,
	});
});

export const Route = createFileRoute("/facts/")({
	component: FactsPage,
	loader: async () => await getFacts(),
});

function FactsPage() {
	const facts = Route.useLoaderData();

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5">
				<p className="mb-2 text-sm text-muted-foreground">Facts</p>
				<h1 className="text-2xl font-semibold">{facts.length} facts loaded</h1>
			</section>

			<FactsTable facts={facts} />
		</main>
	);
}
