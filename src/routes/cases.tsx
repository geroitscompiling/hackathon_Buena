import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { CasesTable } from "#/components/CasesTable";
import { listCases } from "#/services/cases";

const getCases = createServerFn({
	method: "GET",
}).handler(async () => {
	return listCases(undefined, {
		limit: 100,
	});
});

export const Route = createFileRoute("/cases")({
	component: CasesPage,
	loader: async () => await getCases(),
});

function CasesPage() {
	const cases = Route.useLoaderData();

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex items-center justify-between gap-4">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Cases</p>
					<h1 className="text-2xl font-semibold">
						{cases.length} cases loaded
					</h1>
				</div>
			</section>

			<CasesTable cases={cases} />
		</main>
	);
}
