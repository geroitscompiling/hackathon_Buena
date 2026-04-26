import { and, count, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

/** Upper bound for case lists (API / MCP); avoids accidental huge reads. */
const LIST_CASES_MAX = 10_000;

/** Escape `%`, `_`, `\` for SQL `LIKE` / `ESCAPE '\\'`. */
export function escapeSqlLikePattern(fragment: string): string {
	return fragment
		.replaceAll("\\", "\\\\")
		.replaceAll("%", "\\%")
		.replaceAll("_", "\\_");
}

function caseContentMatches(term: string) {
	const pattern = `%${escapeSqlLikePattern(term.trim().toLowerCase())}%`;
	return or(
		sql`LOWER(${schema.cases.title}) LIKE ${pattern} ESCAPE '\\'`,
		sql`LOWER(${schema.cases.summary}) LIKE ${pattern} ESCAPE '\\'`,
		sql`LOWER(${schema.cases.caseKey}) LIKE ${pattern} ESCAPE '\\'`,
		sql`LOWER(${schema.cases.id}) LIKE ${pattern} ESCAPE '\\'`,
	);
}

export const listCasesSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	houseId: z.string().trim().min(1).optional(),
	apartmentId: z.string().trim().min(1).optional(),
	status: z.string().trim().min(1).optional(),
	ownerUserId: z.string().trim().min(1).optional(),
	/** Case-insensitive match on title, summary, case key, and id (use propertyId to narrow by property). */
	q: z.string().trim().min(1).max(500).optional(),
	limit: z.coerce.number().int().positive().max(LIST_CASES_MAX).default(50),
});

export const countCasesSchema = listCasesSchema.omit({ limit: true });

/** Filters accepted by the /cases overview (URL + `getCasesOverview`). */
export const casesOverviewFilterInputSchema = z.object({
	q: z.string().max(500).optional(),
	status: z.string().optional(),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
});

export type CasesOverviewFilters = z.infer<typeof casesOverviewFilterInputSchema>;

/** How many rows the /cases overview loads in one request (total count is always accurate). */
export const CASES_OVERVIEW_LOAD_LIMIT = 5_000;

export function normalizeCasesOverviewFilters(
	raw: CasesOverviewFilters,
): CountCasesArgs {
	const q = raw.q?.trim();
	const status = raw.status?.trim();
	const propertyId = raw.propertyId?.trim();
	const houseId = raw.houseId?.trim();
	const apartmentId = raw.apartmentId?.trim();
	return {
		apartmentId: apartmentId || undefined,
		houseId: houseId || undefined,
		propertyId: propertyId || undefined,
		q: q || undefined,
		status: status || undefined,
	};
}

export type ListCasesArgs = z.infer<typeof listCasesSchema>;
export type CountCasesArgs = z.infer<typeof countCasesSchema>;
export type CaseListItem = Awaited<ReturnType<typeof db.query.cases.findMany>>[number];

export async function listCases(
	database: AppDatabase = db,
	args: unknown,
): Promise<CaseListItem[]> {
	const { apartmentId, houseId, limit, ownerUserId, propertyId, q, status } =
		listCasesSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.cases.propertyId, propertyId) : undefined,
		houseId ? eq(schema.cases.houseId, houseId) : undefined,
		apartmentId ? eq(schema.cases.apartmentId, apartmentId) : undefined,
		status ? eq(schema.cases.status, status) : undefined,
		ownerUserId ? eq(schema.cases.ownerUserId, ownerUserId) : undefined,
		q ? caseContentMatches(q) : undefined,
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
	const { apartmentId, houseId, ownerUserId, propertyId, q, status } =
		countCasesSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.cases.propertyId, propertyId) : undefined,
		houseId ? eq(schema.cases.houseId, houseId) : undefined,
		apartmentId ? eq(schema.cases.apartmentId, apartmentId) : undefined,
		status ? eq(schema.cases.status, status) : undefined,
		ownerUserId ? eq(schema.cases.ownerUserId, ownerUserId) : undefined,
		q ? caseContentMatches(q) : undefined,
	].filter(Boolean);

	const query = database.select({ cnt: count() }).from(schema.cases);
	const [row] =
		filters.length > 0
			? await query.where(and(...filters))
			: await query;

	return Number(row?.cnt ?? 0);
}
