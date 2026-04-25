import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

export const listFactsSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	category: z.string().trim().min(1).optional(),
	key: z.string().trim().min(1).optional(),
	sourceId: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListFactsArgs = z.infer<typeof listFactsSchema>;

export async function listFacts(
	database: AppDatabase = db,
	args: ListFactsArgs,
) {
	const { category, key, limit, propertyId, sourceId } =
		listFactsSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.facts.propertyId, propertyId) : undefined,
		category ? eq(schema.facts.category, category) : undefined,
		key ? eq(schema.facts.key, key) : undefined,
		sourceId ? eq(schema.facts.sourceId, sourceId) : undefined,
	].filter(Boolean);

	return database.query.facts.findMany({
		where: filters.length > 0 ? and(...filters) : undefined,
		limit,
		orderBy: [desc(schema.facts.id)],
		with: {
			property: true,
			source: true,
		},
	});
}
