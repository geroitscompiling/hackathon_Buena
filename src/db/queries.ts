import { and, desc, eq, inArray, like, or } from "drizzle-orm";
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

const hierarchyNameSchema = z.string().trim().min(1);
const hierarchyIdSchema = z.string().trim().min(1);

export const createPropertySchema = z.object({
	id: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const updatePropertySchema = z.object({
	id: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const deletePropertySchema = z.object({
	id: hierarchyIdSchema,
});

export const createHouseSchema = z.object({
	id: hierarchyIdSchema,
	propertyId: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const updateHouseSchema = z.object({
	id: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const deleteHouseSchema = z.object({
	id: hierarchyIdSchema,
});

export const createApartmentSchema = z.object({
	id: hierarchyIdSchema,
	houseId: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const updateApartmentSchema = z.object({
	id: hierarchyIdSchema,
	name: hierarchyNameSchema,
});

export const deleteApartmentSchema = z.object({
	id: hierarchyIdSchema,
});

export type ListPropertiesArgs = z.infer<typeof listPropertiesSchema>;
export type GetPropertyHierarchyArgs = z.infer<
	typeof getPropertyHierarchySchema
>;
export type ListFactsArgs = z.infer<typeof listFactsSchema>;
export type ListCasesArgs = z.infer<typeof listCasesSchema>;
export type CreatePropertyArgs = z.infer<typeof createPropertySchema>;
export type UpdatePropertyArgs = z.infer<typeof updatePropertySchema>;
export type DeletePropertyArgs = z.infer<typeof deletePropertySchema>;
export type CreateHouseArgs = z.infer<typeof createHouseSchema>;
export type UpdateHouseArgs = z.infer<typeof updateHouseSchema>;
export type DeleteHouseArgs = z.infer<typeof deleteHouseSchema>;
export type CreateApartmentArgs = z.infer<typeof createApartmentSchema>;
export type UpdateApartmentArgs = z.infer<typeof updateApartmentSchema>;
export type DeleteApartmentArgs = z.infer<typeof deleteApartmentSchema>;

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

export async function createProperty(
	database: AppDatabase = db,
	args: CreatePropertyArgs,
) {
	const values = createPropertySchema.parse(args);

	await database.insert(schema.properties).values(values);

	return database.query.properties.findFirst({
		where: eq(schema.properties.id, values.id),
	});
}

export async function updateProperty(
	database: AppDatabase = db,
	args: UpdatePropertyArgs,
) {
	const { id, name } = updatePropertySchema.parse(args);

	await database
		.update(schema.properties)
		.set({ name })
		.where(eq(schema.properties.id, id));

	return database.query.properties.findFirst({
		where: eq(schema.properties.id, id),
	});
}

export async function createHouse(
	database: AppDatabase = db,
	args: CreateHouseArgs,
) {
	const values = createHouseSchema.parse(args);

	await database.insert(schema.houses).values(values);

	return database.query.houses.findFirst({
		where: eq(schema.houses.id, values.id),
	});
}

export async function updateHouse(
	database: AppDatabase = db,
	args: UpdateHouseArgs,
) {
	const { id, name } = updateHouseSchema.parse(args);

	await database
		.update(schema.houses)
		.set({ name })
		.where(eq(schema.houses.id, id));

	return database.query.houses.findFirst({
		where: eq(schema.houses.id, id),
	});
}

export async function createApartment(
	database: AppDatabase = db,
	args: CreateApartmentArgs,
) {
	const values = createApartmentSchema.parse(args);

	await database.insert(schema.apartments).values(values);

	return database.query.apartments.findFirst({
		where: eq(schema.apartments.id, values.id),
	});
}

export async function updateApartment(
	database: AppDatabase = db,
	args: UpdateApartmentArgs,
) {
	const { id, name } = updateApartmentSchema.parse(args);

	await database
		.update(schema.apartments)
		.set({ name })
		.where(eq(schema.apartments.id, id));

	return database.query.apartments.findFirst({
		where: eq(schema.apartments.id, id),
	});
}

export async function deleteApartment(
	database: AppDatabase = db,
	args: DeleteApartmentArgs,
) {
	const { id } = deleteApartmentSchema.parse(args);

	const caseRows = await database
		.select({ id: schema.cases.id })
		.from(schema.cases)
		.where(eq(schema.cases.apartmentId, id));
	const caseIds = caseRows.map((row) => row.id);

	if (caseIds.length > 0) {
		await database
			.delete(schema.factCases)
			.where(inArray(schema.factCases.caseId, caseIds));
	}

	await database
		.delete(schema.factApartments)
		.where(eq(schema.factApartments.apartmentId, id));
	await database.delete(schema.cases).where(eq(schema.cases.apartmentId, id));
	await database.delete(schema.apartments).where(eq(schema.apartments.id, id));
}

export async function deleteHouse(
	database: AppDatabase = db,
	args: DeleteHouseArgs,
) {
	const { id } = deleteHouseSchema.parse(args);

	const apartmentRows = await database
		.select({ id: schema.apartments.id })
		.from(schema.apartments)
		.where(eq(schema.apartments.houseId, id));
	const apartmentIds = apartmentRows.map((row) => row.id);
	const caseRows = await database
		.select({ id: schema.cases.id })
		.from(schema.cases)
		.where(
			apartmentIds.length > 0
				? or(
						eq(schema.cases.houseId, id),
						inArray(schema.cases.apartmentId, apartmentIds),
					)
				: eq(schema.cases.houseId, id),
		);
	const caseIds = caseRows.map((row) => row.id);

	if (caseIds.length > 0) {
		await database
			.delete(schema.factCases)
			.where(inArray(schema.factCases.caseId, caseIds));
	}

	if (apartmentIds.length > 0) {
		await database
			.delete(schema.factApartments)
			.where(inArray(schema.factApartments.apartmentId, apartmentIds));
		await database
			.delete(schema.cases)
			.where(inArray(schema.cases.apartmentId, apartmentIds));
		await database
			.delete(schema.apartments)
			.where(inArray(schema.apartments.id, apartmentIds));
	}

	await database
		.delete(schema.factHouses)
		.where(eq(schema.factHouses.houseId, id));
	await database.delete(schema.cases).where(eq(schema.cases.houseId, id));
	await database.delete(schema.houses).where(eq(schema.houses.id, id));
}

export async function deleteProperty(
	database: AppDatabase = db,
	args: DeletePropertyArgs,
) {
	const { id } = deletePropertySchema.parse(args);

	const houseRows = await database
		.select({ id: schema.houses.id })
		.from(schema.houses)
		.where(eq(schema.houses.propertyId, id));
	const houseIds = houseRows.map((row) => row.id);
	const apartmentRows =
		houseIds.length > 0
			? await database
					.select({ id: schema.apartments.id })
					.from(schema.apartments)
					.where(inArray(schema.apartments.houseId, houseIds))
			: [];
	const apartmentIds = apartmentRows.map((row) => row.id);
	const caseRows = await database
		.select({ id: schema.cases.id })
		.from(schema.cases)
		.where(eq(schema.cases.propertyId, id));
	const caseIds = caseRows.map((row) => row.id);
	const factRows = await database
		.select({ id: schema.facts.id })
		.from(schema.facts)
		.where(eq(schema.facts.propertyId, id));
	const factIds = factRows.map((row) => row.id);

	if (caseIds.length > 0) {
		await database
			.delete(schema.factCases)
			.where(inArray(schema.factCases.caseId, caseIds));
	}

	if (factIds.length > 0) {
		await database
			.delete(schema.factCases)
			.where(inArray(schema.factCases.factId, factIds));
		await database
			.delete(schema.factApartments)
			.where(inArray(schema.factApartments.factId, factIds));
		await database
			.delete(schema.factHouses)
			.where(inArray(schema.factHouses.factId, factIds));
	}

	if (apartmentIds.length > 0) {
		await database
			.delete(schema.factApartments)
			.where(inArray(schema.factApartments.apartmentId, apartmentIds));
	}

	if (houseIds.length > 0) {
		await database
			.delete(schema.factHouses)
			.where(inArray(schema.factHouses.houseId, houseIds));
	}

	await database.delete(schema.cases).where(eq(schema.cases.propertyId, id));
	if (apartmentIds.length > 0) {
		await database
			.delete(schema.apartments)
			.where(inArray(schema.apartments.id, apartmentIds));
	}
	if (houseIds.length > 0) {
		await database
			.delete(schema.houses)
			.where(inArray(schema.houses.id, houseIds));
	}
	await database.delete(schema.facts).where(eq(schema.facts.propertyId, id));
	await database.delete(schema.properties).where(eq(schema.properties.id, id));
}
