import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

const hierarchyNameSchema = z.string().trim().min(1);
const hierarchyIdSchema = z.string().trim().min(1);

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

export type CreateApartmentArgs = z.infer<typeof createApartmentSchema>;
export type UpdateApartmentArgs = z.infer<typeof updateApartmentSchema>;
export type DeleteApartmentArgs = z.infer<typeof deleteApartmentSchema>;

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
