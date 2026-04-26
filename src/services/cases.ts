import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

/** Upper bound for case lists (API / MCP); avoids accidental huge reads. */
const LIST_CASES_MAX = 10_000;

export const listCasesSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	houseId: z.string().trim().min(1).optional(),
	apartmentId: z.string().trim().min(1).optional(),
	status: z.string().trim().min(1).optional(),
	ownerUserId: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(LIST_CASES_MAX).default(50),
});

export const countCasesSchema = listCasesSchema.omit({ limit: true });

/** How many rows the /cases overview loads in one request (total count is always accurate). */
export const CASES_OVERVIEW_LOAD_LIMIT = 5_000;

export type ListCasesArgs = z.infer<typeof listCasesSchema>;
export type CountCasesArgs = z.infer<typeof countCasesSchema>;
export type CaseListItem = Awaited<ReturnType<typeof db.query.cases.findMany>>[number];

export async function listCases(
	database: AppDatabase = db,
	args: unknown,
): Promise<CaseListItem[]> {
	const { apartmentId, houseId, limit, ownerUserId, propertyId, status } =
		listCasesSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.cases.propertyId, propertyId) : undefined,
		houseId ? eq(schema.cases.houseId, houseId) : undefined,
		apartmentId ? eq(schema.cases.apartmentId, apartmentId) : undefined,
		status ? eq(schema.cases.status, status) : undefined,
		ownerUserId ? eq(schema.cases.ownerUserId, ownerUserId) : undefined,
	].filter(Boolean);

	return database.query.cases.findMany({
		where: filters.length > 0 ? and(...filters) : undefined,
		limit,
		orderBy: [desc(schema.cases.updatedAt)],
		with: {
			apartment: true,
			house: true,
			owner: true,
			property: true,
		},
	});
}

export async function countCases(
	database: AppDatabase = db,
	args: unknown,
): Promise<number> {
	const { apartmentId, houseId, ownerUserId, propertyId, status } =
		countCasesSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.cases.propertyId, propertyId) : undefined,
		houseId ? eq(schema.cases.houseId, houseId) : undefined,
		apartmentId ? eq(schema.cases.apartmentId, apartmentId) : undefined,
		status ? eq(schema.cases.status, status) : undefined,
		ownerUserId ? eq(schema.cases.ownerUserId, ownerUserId) : undefined,
	].filter(Boolean);

	const query = database.select({ cnt: count() }).from(schema.cases);
	const [row] =
		filters.length > 0
			? await query.where(and(...filters))
			: await query;

	return Number(row?.cnt ?? 0);
}
