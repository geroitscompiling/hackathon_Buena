import { createFileRoute } from "@tanstack/react-router";

import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import { semanticSearch } from "#/services/semanticIndex";

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await semanticSearch(new GeminiEmbeddingService(), undefined, {
					query: searchParams.get("query") ?? "",
					entityType: searchParams.get("entityType") ?? undefined,
					propertyId: searchParams.get("propertyId") ?? undefined,
					houseId: searchParams.get("houseId") ?? undefined,
					apartmentId: searchParams.get("apartmentId") ?? undefined,
					limit: searchParams.get("limit") ?? undefined,
				});

				return Response.json(result);
			},
		},
	},
});
