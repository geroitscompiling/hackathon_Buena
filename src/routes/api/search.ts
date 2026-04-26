import { createFileRoute } from "@tanstack/react-router";
import { count, isNotNull } from "drizzle-orm";

import * as schema from "#/db/schema";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import { db } from "#/services/database";
import { semanticSearch } from "#/services/semanticIndex";

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;

				const [[factIndexedRow], [caseIndexedRow], [factTotalRow], [caseTotalRow]] =
					await Promise.all([
						db
							.select({ cnt: count() })
							.from(schema.facts)
							.where(isNotNull(schema.facts.embedding)),
						db
							.select({ cnt: count() })
							.from(schema.cases)
							.where(isNotNull(schema.cases.embedding)),
						db.select({ cnt: count() }).from(schema.facts),
						db.select({ cnt: count() }).from(schema.cases),
					]);

				const indexHeaders = {
					"X-Search-Index-Facts": String(Number(factIndexedRow?.cnt ?? 0)),
					"X-Search-Index-Cases": String(Number(caseIndexedRow?.cnt ?? 0)),
					"X-Search-Total-Facts": String(Number(factTotalRow?.cnt ?? 0)),
					"X-Search-Total-Cases": String(Number(caseTotalRow?.cnt ?? 0)),
				};

				try {
					const result = await semanticSearch(new GeminiEmbeddingService(), undefined, {
						query: searchParams.get("query") ?? "",
						entityType: searchParams.get("entityType") ?? undefined,
						goldStandard: searchParams.get("goldStandard") ?? undefined,
						propertyId: searchParams.get("propertyId") ?? undefined,
						houseId: searchParams.get("houseId") ?? undefined,
						apartmentId: searchParams.get("apartmentId") ?? undefined,
						limit: searchParams.get("limit") ?? undefined,
					});

					return Response.json(result, { headers: indexHeaders });
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : "Search failed";
					return Response.json({ error: message }, { status: 400, headers: indexHeaders });
				}
			},
		},
	},
});
