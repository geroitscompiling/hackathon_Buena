import { createFileRoute } from "@tanstack/react-router";

import { getPropertyHierarchy } from "#/db/queries";

export const Route = createFileRoute("/api/property-hierarchy")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const propertyId = searchParams.get("propertyId");

				if (!propertyId) {
					return Response.json(
						{ error: "Missing propertyId" },
						{ status: 400 },
					);
				}

				const result = await getPropertyHierarchy(undefined, {
					propertyId,
				});

				return Response.json(result);
			},
		},
	},
});
