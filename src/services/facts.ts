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

export const listFactsForScopeSchema = z.object({
	scopeType: z.enum(["property", "house", "apartment"]),
	scopeId: z.string().trim().min(1),
	limit: z.coerce.number().int().positive().max(100).default(100),
});

export type ListFactsArgs = z.infer<typeof listFactsSchema>;
export type ListFactsForScopeArgs = z.infer<typeof listFactsForScopeSchema>;
export type FactListItem = {
	id: string;
	propertyId: string;
	category: string;
	key: string;
	value: string;
	isGoldStandard: boolean;
	confidenceScore: number;
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
	args: ListFactsArgs,
): Promise<FactListItem[]> {
	const { category, key, limit, propertyId, sourceId } =
		listFactsSchema.parse(args);
	const filters = [
		propertyId ? eq(schema.facts.propertyId, propertyId) : undefined,
		category ? eq(schema.facts.category, category) : undefined,
		key ? eq(schema.facts.key, key) : undefined,
		sourceId ? eq(schema.facts.sourceId, sourceId) : undefined,
	].filter(Boolean);

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
