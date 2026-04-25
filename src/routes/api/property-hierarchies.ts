import { createFileRoute } from "@tanstack/react-router";

import { listPropertyHierarchies } from "#/services/properties";

export const Route = createFileRoute("/api/property-hierarchies")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await listPropertyHierarchies(undefined, {
					limit: searchParams.get("limit") ?? undefined,
					search: searchParams.get("search") ?? undefined,
				});

				return Response.json(result);
			},
		},
	},
});
