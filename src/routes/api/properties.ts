import { createFileRoute } from "@tanstack/react-router";

import { listProperties } from "#/services/properties";

export const Route = createFileRoute("/api/properties")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await listProperties(undefined, {
					limit: searchParams.get("limit") ?? undefined,
					search: searchParams.get("search") ?? undefined,
				});

				return Response.json(result);
			},
		},
	},
});
