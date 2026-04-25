import { createFileRoute } from "@tanstack/react-router";

import { listFacts } from "#/services/facts";

export const Route = createFileRoute("/api/facts")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await listFacts(undefined, {
					category: searchParams.get("category") ?? undefined,
					key: searchParams.get("key") ?? undefined,
					limit: searchParams.get("limit") ?? undefined,
					propertyId: searchParams.get("propertyId") ?? undefined,
					sourceId: searchParams.get("sourceId") ?? undefined,
				});

				return Response.json(result);
			},
		},
	},
});
