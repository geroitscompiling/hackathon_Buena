import { and, desc, eq, like } from "drizzle-orm";
import { z } from "zod";

import { db } from "#/db/index";
import * as schema from "#/db/schema";

type AppDatabase = typeof db;

export const listPropertiesSchema = z.object({
	search: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(100).default(25),
});

export const getPropertyHierarchySchema = z.object({
	propertyId: z.string().trim().min(1),
});

export const listFactsSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	category: z.string().trim().min(1).optional(),
	key: z.string().trim().min(1).optional(),
	sourceId: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
});

export const listCasesSchema = z.object({
	propertyId: z.string().trim().min(1).optional(),
	houseId: z.string().trim().min(1).optional(),
	apartmentId: z.string().trim().min(1).optional(),
	status: z.string().trim().min(1).optional(),
	ownerUserId: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(100).default(50),
});

export type ListPropertiesArgs = z.infer<typeof listPropertiesSchema>;
export type GetPropertyHierarchyArgs = z.infer<
	typeof getPropertyHierarchySchema
>;
export type ListFactsArgs = z.infer<typeof listFactsSchema>;
export type ListCasesArgs = z.infer<typeof listCasesSchema>;

export async function listProperties(
	database: AppDatabase = db,
	args: ListPropertiesArgs,
) {
	const { limit, search } = listPropertiesSchema.parse(args);
	const searchFilter = search
		? like(schema.properties.name, `%${search}%`)
		: undefined;

	return database.query.properties.findMany({
		where: searchFilter,
		limit,
		orderBy: [schema.properties.name],
	});
}

export async function listPropertyHierarchies(
	database: AppDatabase = db,
	args: ListPropertiesArgs,
) {
	const { limit, search } = listPropertiesSchema.parse(args);
	const searchFilter = search
		? like(schema.properties.name, `%${search}%`)
		: undefined;

	return database.query.properties.findMany({
		where: searchFilter,
		limit,
		orderBy: [schema.properties.name],
		with: {
			houses: {
				with: {
					apartments: true,
				},
			},
		},
	});
}

export async function getPropertyHierarchy(
	database: AppDatabase = db,
	args: GetPropertyHierarchyArgs,
) {
	const { propertyId } = getPropertyHierarchySchema.parse(args);
	const property = await database.query.properties.findFirst({
		where: eq(schema.properties.id, propertyId),
		with: {
			houses: {
				with: {
					apartments: true,
				},
			},
		},
	});

	if (!property) {
		throw new Error(`Property not found: ${propertyId}`);
	}

	return property;
}

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

export async function listCases(
	database: AppDatabase = db,
	args: ListCasesArgs,
) {
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
