import { createFileRoute } from "@tanstack/react-router";

import { listCases } from "#/services/cases";

export const Route = createFileRoute("/api/cases")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await listCases(undefined, {
					apartmentId: searchParams.get("apartmentId") ?? undefined,
					houseId: searchParams.get("houseId") ?? undefined,
					limit: searchParams.get("limit") ?? undefined,
					ownerUserId: searchParams.get("ownerUserId") ?? undefined,
					propertyId: searchParams.get("propertyId") ?? undefined,
					q: searchParams.get("q") ?? undefined,
					status: searchParams.get("status") ?? undefined,
				});

				return Response.json(result);
			},
		},
	},
});
