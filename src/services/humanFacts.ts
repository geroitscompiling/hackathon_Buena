import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import * as schema from "#/db/schema";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import { getGeminiServiceRuntimeEnv } from "#/env";
import type { AppDatabase } from "#/services/database";
import { SemanticIndexService } from "#/services/semanticIndex";

export const HUMAN_SOURCE_ID = "source-human-ui";

const isoDateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const buildingFactCategorySchema = z.enum([
	"core_erp",
	"financial",
	"maintenance",
	"governance",
]);

export const createHumanFactSchema = z.object({
	propertyId: z.string().trim().min(1),
	category: buildingFactCategorySchema,
	key: z.string().trim().min(1),
	value: z.string().trim().min(1),
	validFrom: isoDateSchema.optional(),
	houseIds: z.array(z.string().trim().min(1)).optional(),
	apartmentIds: z.array(z.string().trim().min(1)).optional(),
});

export const updateHumanFactSchema = z
	.object({
		id: z.string().trim().min(1),
		category: buildingFactCategorySchema.optional(),
		key: z.string().trim().min(1).optional(),
		value: z.string().trim().min(1).optional(),
		validFrom: z.union([isoDateSchema, z.null()]).optional(),
	})
	.superRefine((data, ctx) => {
		const hasPatch =
			data.category !== undefined ||
			data.key !== undefined ||
			data.value !== undefined ||
			data.validFrom !== undefined;
		if (!hasPatch) {
			ctx.addIssue({
				code: "custom",
				message: "At least one field to update is required",
			});
		}
	});

export type CreateHumanFactArgs = z.infer<typeof createHumanFactSchema>;
export type UpdateHumanFactArgs = z.infer<typeof updateHumanFactSchema>;

function semanticIndexForDb(database: AppDatabase) {
	const env = getGeminiServiceRuntimeEnv();
	const client =
		env.GEMINI_API_KEY && env.GEMINI_MODEL_EMBEDDING
			? new GeminiEmbeddingService()
			: undefined;
	return new SemanticIndexService(database, client);
}

async function ensureHumanSource(database: AppDatabase): Promise<void> {
	const existing = await database.query.sources.findFirst({
		where: eq(schema.sources.id, HUMAN_SOURCE_ID),
	});
	if (existing) {
		return;
	}
	const now = new Date().toISOString();
	await database.insert(schema.sources).values({
		id: HUMAN_SOURCE_ID,
		fileId: "human-ui",
		fileType: "human",
		ingestionDate: now,
	});
}

export type FactsScopeContext = {
	propertyId: string;
	presetHouseIds: string[];
	presetApartmentIds: string[];
};

export async function resolveFactsScopeContext(
	database: AppDatabase,
	scopeType: "property" | "house" | "apartment",
	scopeId: string,
): Promise<FactsScopeContext> {
	if (scopeType === "property") {
		return {
			propertyId: scopeId,
			presetApartmentIds: [],
			presetHouseIds: [],
		};
	}

	if (scopeType === "house") {
		const house = await database.query.houses.findFirst({
			where: eq(schema.houses.id, scopeId),
		});
		if (!house) {
			throw new Error(`House not found: ${scopeId}`);
		}
		return {
			propertyId: house.propertyId,
			presetApartmentIds: [],
			presetHouseIds: [scopeId],
		};
	}

	const apartment = await database.query.apartments.findFirst({
		where: eq(schema.apartments.id, scopeId),
		with: { house: true },
	});
	if (!apartment) {
		throw new Error(`Apartment not found: ${scopeId}`);
	}

	return {
		propertyId: apartment.house.propertyId,
		presetApartmentIds: [scopeId],
		presetHouseIds: [apartment.houseId],
	};
}

export async function createHumanFact(
	database: AppDatabase,
	args: unknown,
): Promise<{ id: string }> {
	const parsed = createHumanFactSchema.parse(args);
	const property = await database.query.properties.findFirst({
		where: eq(schema.properties.id, parsed.propertyId),
	});
	if (!property) {
		throw new Error(`Property not found: ${parsed.propertyId}`);
	}

	await ensureHumanSource(database);

	const houseIds = parsed.houseIds ?? [];
	const apartmentIds = parsed.apartmentIds ?? [];

	if (houseIds.length > 0) {
		const rows = await database.query.houses.findMany({
			where: inArray(schema.houses.id, houseIds),
		});
		if (rows.length !== houseIds.length) {
			throw new Error("One or more house ids are invalid");
		}
		for (const row of rows) {
			if (row.propertyId !== parsed.propertyId) {
				throw new Error("House does not belong to the selected property");
			}
		}
	}

	const houseIdsForLinks = new Set(houseIds);
	for (const apartmentId of apartmentIds) {
		const apt = await database.query.apartments.findFirst({
			where: eq(schema.apartments.id, apartmentId),
			with: { house: true },
		});
		if (!apt || apt.house.propertyId !== parsed.propertyId) {
			throw new Error("Apartment does not belong to the selected property");
		}
		houseIdsForLinks.add(apt.houseId);
	}

	const id = randomUUID();
	await database.insert(schema.facts).values({
		id,
		propertyId: parsed.propertyId,
		category: parsed.category,
		key: parsed.key,
		value: parsed.value,
		sourceId: HUMAN_SOURCE_ID,
		isGoldStandard: false,
		confidenceScore: 1,
		validFrom: parsed.validFrom ?? null,
	});

	for (const houseId of houseIdsForLinks) {
		await database.insert(schema.factHouses).values({
			factId: id,
			houseId,
		});
	}

	for (const apartmentId of apartmentIds) {
		await database.insert(schema.factApartments).values({
			apartmentId,
			factId: id,
		});
	}

	await semanticIndexForDb(database).refreshFactEmbeddingById(id);
	return { id };
}

export async function updateHumanFact(
	database: AppDatabase,
	args: unknown,
): Promise<void> {
	const parsed = updateHumanFactSchema.parse(args);
	const existing = await database.query.facts.findFirst({
		where: eq(schema.facts.id, parsed.id),
	});
	if (!existing) {
		throw new Error(`Fact not found: ${parsed.id}`);
	}

	const patch: Partial<typeof schema.facts.$inferInsert> = {};
	if (parsed.category !== undefined) {
		patch.category = parsed.category;
	}
	if (parsed.key !== undefined) {
		patch.key = parsed.key;
	}
	if (parsed.value !== undefined) {
		patch.value = parsed.value;
	}
	if (parsed.validFrom !== undefined) {
		patch.validFrom = parsed.validFrom;
	}

	if (Object.keys(patch).length === 0) {
		return;
	}

	await database
		.update(schema.facts)
		.set(patch)
		.where(eq(schema.facts.id, parsed.id));

	await semanticIndexForDb(database).refreshFactEmbeddingById(parsed.id);
}
