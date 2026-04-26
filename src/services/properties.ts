import { eq, inArray, like } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

export const listPropertiesSchema = z.object({
	search: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(100).default(25),
});

export const getPropertyHierarchySchema = z.object({
	propertyId: z.string().trim().min(1),
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

export type ListPropertiesArgs = z.infer<typeof listPropertiesSchema>;
export type GetPropertyHierarchyArgs = z.infer<
	typeof getPropertyHierarchySchema
>;
export type CreatePropertyArgs = z.infer<typeof createPropertySchema>;
export type UpdatePropertyArgs = z.infer<typeof updatePropertySchema>;
export type DeletePropertyArgs = z.infer<typeof deletePropertySchema>;

export type HierarchyFact = {
	id: string;
	category: string;
	key: string;
	value: string;
	isGoldStandard: boolean;
	confidenceScore: number;
	source: {
		id: string;
		fileId: string;
		fileType: string;
	};
};

export type PropertyHierarchy = {
	id: string;
	name: string;
	facts: HierarchyFact[];
	houses: Array<{
		id: string;
		name: string;
		propertyId: string;
		facts: HierarchyFact[];
		apartments: Array<{
			id: string;
			houseId: string;
			name: string;
			facts: HierarchyFact[];
		}>;
	}>;
};

function normalizeFact(
	fact: Pick<
		typeof schema.facts.$inferSelect,
		| "id"
		| "category"
		| "key"
		| "value"
		| "isGoldStandard"
		| "confidenceScore"
	> & {
		source: Pick<
			typeof schema.sources.$inferSelect,
			"id" | "fileId" | "fileType"
		>;
	},
): HierarchyFact {
	return {
		category: fact.category,
		confidenceScore: fact.confidenceScore,
		id: fact.id,
		isGoldStandard: fact.isGoldStandard,
		key: fact.key,
		source: {
			fileId: fact.source.fileId,
			fileType: fact.source.fileType,
			id: fact.source.id,
		},
		value: fact.value,
	};
}

function normalizePropertyHierarchy(property: {
	id: string;
	name: string;
	facts: Array<
		Pick<
			typeof schema.facts.$inferSelect,
			| "id"
			| "category"
			| "key"
			| "value"
			| "isGoldStandard"
			| "confidenceScore"
		> & {
			source: Pick<
				typeof schema.sources.$inferSelect,
				"id" | "fileId" | "fileType"
			>;
		}
	>;
	houses: Array<{
		id: string;
		name: string;
		propertyId: string;
		factLinks: Array<{
			fact: Pick<
				typeof schema.facts.$inferSelect,
				| "id"
				| "category"
				| "key"
				| "value"
				| "isGoldStandard"
				| "confidenceScore"
			> & {
				source: Pick<
					typeof schema.sources.$inferSelect,
					"id" | "fileId" | "fileType"
				>;
			};
		}>;
		apartments: Array<{
			id: string;
			houseId: string;
			name: string;
			factLinks: Array<{
				fact: Pick<
					typeof schema.facts.$inferSelect,
					| "id"
					| "category"
					| "key"
					| "value"
					| "isGoldStandard"
					| "confidenceScore"
				> & {
					source: Pick<
						typeof schema.sources.$inferSelect,
						"id" | "fileId" | "fileType"
					>;
				};
			}>;
		}>;
	}>;
}): PropertyHierarchy {
	return {
		facts: property.facts.map(normalizeFact),
		houses: property.houses.map((house) => ({
			apartments: house.apartments.map((apartment) => ({
				facts: apartment.factLinks.map((link) => normalizeFact(link.fact)),
				houseId: apartment.houseId,
				id: apartment.id,
				name: apartment.name,
			})),
			facts: house.factLinks.map((link) => normalizeFact(link.fact)),
			id: house.id,
			name: house.name,
			propertyId: house.propertyId,
		})),
		id: property.id,
		name: property.name,
	};
}

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
	args: unknown,
): Promise<PropertyHierarchy[]> {
	const { limit, search } = listPropertiesSchema.parse(args);
	const searchFilter = search
		? like(schema.properties.name, `%${search}%`)
		: undefined;

	const properties = await database.query.properties.findMany({
		where: searchFilter,
		limit,
		orderBy: [schema.properties.name],
		with: {
			facts: {
				with: {
					source: true,
				},
			},
			houses: {
				with: {
					apartments: {
						with: {
							factLinks: {
								with: {
									fact: {
										with: {
											source: true,
										},
									},
								},
							},
						},
					},
					factLinks: {
						with: {
							fact: {
								with: {
									source: true,
								},
							},
						},
					},
				},
			},
		},
	});

	return properties.map(normalizePropertyHierarchy);
}

export async function getPropertyHierarchy(
	database: AppDatabase = db,
	args: GetPropertyHierarchyArgs,
): Promise<PropertyHierarchy> {
	const { propertyId } = getPropertyHierarchySchema.parse(args);
	const property = await database.query.properties.findFirst({
		where: eq(schema.properties.id, propertyId),
		with: {
			facts: {
				with: {
					source: true,
				},
			},
			houses: {
				with: {
					apartments: {
						with: {
							factLinks: {
								with: {
									fact: {
										with: {
											source: true,
										},
									},
								},
							},
						},
					},
					factLinks: {
						with: {
							fact: {
								with: {
									source: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!property) {
		throw new Error(`Property not found: ${propertyId}`);
	}

	return normalizePropertyHierarchy(property);
}

export async function createProperty(
	database: AppDatabase = db,
	args: CreatePropertyArgs,
) {
	const values = createPropertySchema.parse(args);

	await database.insert(schema.properties).values(values);

	const created = await database.query.properties.findFirst({
		where: eq(schema.properties.id, values.id),
	});
	if (!created) {
		throw new Error(`Failed to load property after create: ${values.id}`);
	}
	return created;
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

	const updated = await database.query.properties.findFirst({
		where: eq(schema.properties.id, id),
	});
	if (!updated) {
		throw new Error(`Failed to load property after update: ${id}`);
	}
	return updated;
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
