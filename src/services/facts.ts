import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { escapeSqlLikePattern } from "#/services/cases";
import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

/** Upper bound for unfiltered fact lists (API / MCP); avoids accidental multi-million row reads. */
const LIST_FACTS_MAX = 10_000;

export const listFactsSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	category: z.string().trim().min(1).optional(),
	key: z.string().trim().min(1).optional(),
	sourceId: z.string().trim().min(1).optional(),
	/** Case-insensitive match on key, value, id, property name, and source file id. */
	q: z.string().trim().min(1).max(500).optional(),
	houseId: z.string().trim().min(1).optional(),
	apartmentId: z.string().trim().min(1).optional(),
	goldStandard: z.enum(["all", "gold", "nonGold"]).default("all"),
	limit: z.coerce.number().int().positive().max(LIST_FACTS_MAX).default(50),
});

export const countFactsSchema = listFactsSchema.omit({ limit: true });

export const listFactsForScopeSchema = z.object({
	scopeType: z.enum(["property", "house", "apartment"]),
	scopeId: z.string().trim().min(1),
	limit: z.coerce.number().int().positive().max(LIST_FACTS_MAX).default(100),
});

/** How many rows the /facts overview loads in one request (total count is always accurate). */
export const FACTS_OVERVIEW_LOAD_LIMIT = 5_000;

export type ListFactsArgs = z.infer<typeof listFactsSchema>;
export type CountFactsArgs = z.infer<typeof countFactsSchema>;
export type ListFactsForScopeArgs = z.infer<typeof listFactsForScopeSchema>;
function factContentMatches(database: AppDatabase, term: string) {
	const pattern = `%${escapeSqlLikePattern(term.trim().toLowerCase())}%`;
	return or(
		sql`LOWER(${schema.facts.key}) LIKE ${pattern} ESCAPE '\\'`,
		sql`LOWER(${schema.facts.value}) LIKE ${pattern} ESCAPE '\\'`,
		sql`LOWER(${schema.facts.id}) LIKE ${pattern} ESCAPE '\\'`,
		inArray(
			schema.facts.propertyId,
			database
				.select({ id: schema.properties.id })
				.from(schema.properties)
				.where(sql`LOWER(${schema.properties.name}) LIKE ${pattern} ESCAPE '\\'`),
		),
		inArray(
			schema.facts.sourceId,
			database
				.select({ id: schema.sources.id })
				.from(schema.sources)
				.where(sql`LOWER(${schema.sources.fileId}) LIKE ${pattern} ESCAPE '\\'`),
		),
	);
}

type FactsFilterInput = {
	propertyId?: string | undefined;
	category?: string | undefined;
	key?: string | undefined;
	sourceId?: string | undefined;
	q?: string | undefined;
	houseId?: string | undefined;
	apartmentId?: string | undefined;
	goldStandard?: "all" | "gold" | "nonGold" | undefined;
};

function buildFactsFilters(database: AppDatabase, input: FactsFilterInput) {
	const goldStandard = input.goldStandard ?? "all";
	const filters = [
		input.propertyId ? eq(schema.facts.propertyId, input.propertyId) : undefined,
		input.category ? eq(schema.facts.category, input.category) : undefined,
		input.key ? eq(schema.facts.key, input.key) : undefined,
		input.sourceId ? eq(schema.facts.sourceId, input.sourceId) : undefined,
		input.q ? factContentMatches(database, input.q) : undefined,
		input.houseId ?
			inArray(
				schema.facts.id,
				database
					.select({ factId: schema.factHouses.factId })
					.from(schema.factHouses)
					.where(eq(schema.factHouses.houseId, input.houseId)),
			)
		:	undefined,
		input.apartmentId ?
			inArray(
				schema.facts.id,
				database
					.select({ factId: schema.factApartments.factId })
					.from(schema.factApartments)
					.where(eq(schema.factApartments.apartmentId, input.apartmentId)),
			)
		:	undefined,
		goldStandard === "gold" ? eq(schema.facts.isGoldStandard, true) : undefined,
		goldStandard === "nonGold" ?
			eq(schema.facts.isGoldStandard, false)
		:	undefined,
	].filter(Boolean);
	return filters;
}

export type FactListItem = {
	id: string;
	propertyId: string;
	category: string;
	key: string;
	value: string;
	isGoldStandard: boolean;
	confidenceScore: number;
	validFrom: string | null;
	property: {
		id: string;
		name: string;
	};
	source: {
		id: string;
		fileId: string;
		fileType: string;
	};
	houseIds: string[];
	apartmentIds: string[];
	caseIds: string[];
};

export async function listFacts(
	database: AppDatabase = db,
	args: unknown,
): Promise<FactListItem[]> {
	const parsed = listFactsSchema.parse(args);
	const {
		apartmentId,
		category,
		goldStandard,
		houseId,
		key,
		limit,
		propertyId,
		q,
		sourceId,
	} = parsed;
	const filters = buildFactsFilters(database, {
		apartmentId,
		category,
		goldStandard,
		houseId,
		key,
		propertyId,
		q,
		sourceId,
	});

	const facts = await database.query.facts.findMany({
		where: filters.length > 0 ? and(...filters) : undefined,
		limit,
		orderBy: [desc(schema.facts.id)],
		with: {
			apartmentLinks: true,
			caseLinks: true,
			houseLinks: true,
			property: true,
			source: true,
		},
	});

	return facts.map((fact) => ({
		apartmentIds: fact.apartmentLinks.map((link) => link.apartmentId),
		caseIds: fact.caseLinks.map((link) => link.caseId),
		category: fact.category,
		confidenceScore: fact.confidenceScore,
		houseIds: fact.houseLinks.map((link) => link.houseId),
		id: fact.id,
		isGoldStandard: fact.isGoldStandard,
		key: fact.key,
		validFrom: fact.validFrom ?? null,
		property: {
			id: fact.property.id,
			name: fact.property.name,
		},
		propertyId: fact.propertyId,
		source: {
			fileId: fact.source.fileId,
			fileType: fact.source.fileType,
			id: fact.source.id,
		},
		value: fact.value,
	}));
}

export async function countFacts(
	database: AppDatabase = db,
	args: unknown,
): Promise<number> {
	const parsed = countFactsSchema.parse(args);
	const {
		apartmentId,
		category,
		goldStandard,
		houseId,
		key,
		propertyId,
		q,
		sourceId,
	} = parsed;
	const filters = buildFactsFilters(database, {
		apartmentId,
		category,
		goldStandard,
		houseId,
		key,
		propertyId,
		q,
		sourceId,
	});

	const query = database
		.select({ cnt: count() })
		.from(schema.facts);
	const [row] =
		filters.length > 0
			? await query.where(and(...filters))
			: await query;

	return Number(row?.cnt ?? 0);
}

export async function listFactsForScope(
	database: AppDatabase = db,
	args: ListFactsForScopeArgs,
): Promise<FactListItem[]> {
	const { limit, scopeId, scopeType } = listFactsForScopeSchema.parse(args);

	if (scopeType === "property") {
		return listFacts(database, {
			limit,
			propertyId: scopeId,
		});
	}

	const facts = await listFacts(database, {
		limit,
	});

	if (scopeType === "house") {
		return facts.filter((fact) => fact.houseIds.includes(scopeId));
	}

	return facts.filter((fact) => fact.apartmentIds.includes(scopeId));
}
