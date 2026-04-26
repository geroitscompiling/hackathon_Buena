import { createFileRoute } from "@tanstack/react-router";
import { db } from "#/services/database";
import { listFacts } from "#/services/facts";
import {
	createHumanFact,
	createHumanFactSchema,
	updateHumanFact,
	updateHumanFactSchema,
} from "#/services/humanFacts";

export const Route = createFileRoute("/api/facts")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const searchParams = new URL(request.url).searchParams;
				const result = await listFacts(undefined, {
					apartmentId: searchParams.get("apartmentId") ?? undefined,
					category: searchParams.get("category") ?? undefined,
					goldStandard: searchParams.get("goldStandard") ?? undefined,
					houseId: searchParams.get("houseId") ?? undefined,
					key: searchParams.get("key") ?? undefined,
					limit: searchParams.get("limit") ?? undefined,
					propertyId: searchParams.get("propertyId") ?? undefined,
					q: searchParams.get("q") ?? undefined,
					sourceId: searchParams.get("sourceId") ?? undefined,
				});

				return Response.json(result);
			},
			POST: async ({ request }) => {
				const body: unknown = await request.json();
				const parsed = createHumanFactSchema.parse(body);
				const { id } = await createHumanFact(db, parsed);
				return Response.json({ id }, { status: 201 });
			},
			PATCH: async ({ request }) => {
				const body: unknown = await request.json();
				const parsed = updateHumanFactSchema.parse(body);
				await updateHumanFact(db, parsed);
				return new Response(null, { status: 204 });
			},
		},
	},
});
