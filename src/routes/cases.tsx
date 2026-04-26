import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { CasesTable } from "#/components/CasesTable";
import {
	CASES_OVERVIEW_LOAD_LIMIT,
	countCases,
	listCases,
} from "#/services/cases";

const getCasesOverview = createServerFn({
	method: "GET",
}).handler(async () => {
	const total = await countCases(undefined, {});
	const limit = Math.min(CASES_OVERVIEW_LOAD_LIMIT, Math.max(total, 1));
	const cases = await listCases(undefined, { limit });
	return { cases, total };
});

export const Route = createFileRoute("/cases")({
	component: CasesPage,
	loader: async () => await getCasesOverview(),
});

function CasesPage() {
	const { cases, total } = Route.useLoaderData();

	const headline =
		cases.length < total
			? `${cases.length.toLocaleString()} cases shown (${total.toLocaleString()} total)`
			: `${cases.length.toLocaleString()} cases loaded`;

	return (
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex items-center justify-between gap-4">
				<div>
					<p className="mb-2 text-sm text-muted-foreground">Cases</p>
					<h1 className="text-2xl font-semibold">{headline}</h1>
					{cases.length < total ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Showing the {cases.length.toLocaleString()} most recently
							updated rows in this view. The full total is{" "}
							{total.toLocaleString()}.
						</p>
					) : null}
				</div>
			</section>

			<CasesTable cases={cases} />
		</main>
	);
}
