import { eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

const hierarchyNameSchema = z.string().trim().min(1);
const hierarchyIdSchema = z.string().trim().min(1);

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

export type CreateHouseArgs = z.infer<typeof createHouseSchema>;
export type UpdateHouseArgs = z.infer<typeof updateHouseSchema>;
export type DeleteHouseArgs = z.infer<typeof deleteHouseSchema>;

export async function createHouse(
	database: AppDatabase = db,
	args: CreateHouseArgs,
) {
	const values = createHouseSchema.parse(args);

	await database.insert(schema.houses).values(values);

	const created = await database.query.houses.findFirst({
		where: eq(schema.houses.id, values.id),
	});
	if (!created) {
		throw new Error(`Failed to load house after create: ${values.id}`);
	}
	return created;
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

	const updated = await database.query.houses.findFirst({
		where: eq(schema.houses.id, id),
	});
	if (!updated) {
		throw new Error(`Failed to load house after update: ${id}`);
	}
	return updated;
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
