import { and, cosineDistance, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db, type AppDatabase } from "#/services/database";
import * as schema from "#/db/schema";

export type EmbeddingClient = {
	embedDocument: (text: string) => Promise<number[]>;
	embedQuery: (text: string) => Promise<number[]>;
};

export const semanticSearchSchema = z.object({
	query: z.string().trim().min(1),
	entityType: z.enum(["fact", "case", "all"]).default("all"),
	propertyId: z.string().trim().min(1).optional(),
	houseId: z.string().trim().min(1).optional(),
	apartmentId: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().positive().max(50).default(10),
});

export type SemanticSearchArgs = z.infer<typeof semanticSearchSchema>;

export type SemanticSearchResult = {
	entityType: "fact" | "case";
	id: string;
	score: number;
	snippet: string;
	payload: unknown;
};

function toVectorLiteral(values: number[]): string {
	return `[${values.join(",")}]`;
}

function toVectorSql(values: number[]) {
	return sql`${toVectorLiteral(values)}::vector`;
}

function compactParts(parts: Array<string | null | undefined | false>): string {
	return parts.filter((part): part is string => Boolean(part?.trim())).join(" | ");
}

export function formatSemanticSearchQuery(query: string): string {
	return `task: search result | query: ${query.trim()}`;
}

export function formatFactEmbeddingDocument(input: {
	propertyId: string;
	houseId?: string | null;
	apartmentId?: string | null;
	category: string;
	key: string;
	value: string;
	isGoldStandard: boolean;
	sourceFileId: string;
}): string {
	return compactParts([
		"title: fact",
		`text: property=${input.propertyId}`,
		input.houseId ? `house=${input.houseId}` : null,
		input.apartmentId ? `apartment=${input.apartmentId}` : null,
		`category=${input.category}`,
		`key=${input.key}`,
		`value=${input.value}`,
		`gold=${input.isGoldStandard ? "true" : "false"}`,
		`source=${input.sourceFileId}`,
	]);
}

export function formatCaseEmbeddingDocument(input: {
	propertyId: string;
	houseId?: string | null;
	apartmentId?: string | null;
	title: string;
	summary: string;
	status: string;
	closurePredicate?: string | null;
	ownerName: string;
}): string {
	return compactParts([
		`title: ${input.title}`,
		`text: property=${input.propertyId}`,
		input.houseId ? `house=${input.houseId}` : null,
		input.apartmentId ? `apartment=${input.apartmentId}` : null,
		`status=${input.status}`,
		input.closurePredicate ? `closure=${input.closurePredicate}` : null,
		`owner=${input.ownerName}`,
		input.summary,
	]);
}

export class SemanticIndexService {
	constructor(
		private readonly database: AppDatabase = db,
		private readonly embeddingClient?: EmbeddingClient,
	) {}

	async refreshFactEmbeddingById(factId: string): Promise<void> {
		if (!this.embeddingClient) {
			return;
		}

		const fact = await this.database.query.facts.findFirst({
			where: eq(schema.facts.id, factId),
			with: {
				source: true,
				houseLinks: true,
				apartmentLinks: true,
			},
		});
		if (!fact) {
			return;
		}

		const embedding = await this.embeddingClient.embedDocument(
			formatFactEmbeddingDocument({
				propertyId: fact.propertyId,
				houseId: fact.houseLinks[0]?.houseId ?? null,
				apartmentId: fact.apartmentLinks[0]?.apartmentId ?? null,
				category: fact.category,
				key: fact.key,
				value: fact.value,
				isGoldStandard: fact.isGoldStandard,
				sourceFileId: fact.source.fileId,
			}),
		);

		await this.database
			.update(schema.facts)
			.set({ embedding: toVectorSql(embedding) as never })
			.where(eq(schema.facts.id, factId));
	}

	async refreshCaseEmbeddingById(caseId: string): Promise<void> {
		if (!this.embeddingClient) {
			return;
		}

		const row = await this.database.query.cases.findFirst({
			where: eq(schema.cases.id, caseId),
			with: {
				owner: true,
			},
		});
		if (!row) {
			return;
		}

		const embedding = await this.embeddingClient.embedDocument(
			formatCaseEmbeddingDocument({
				propertyId: row.propertyId,
				houseId: row.houseId,
				apartmentId: row.apartmentId,
				title: row.title,
				summary: row.summary,
				status: row.status,
				closurePredicate: row.closurePredicate,
				ownerName: row.owner.name,
			}),
		);

		await this.database
			.update(schema.cases)
			.set({ embedding: toVectorSql(embedding) as never })
			.where(eq(schema.cases.id, caseId));
	}

	async backfillMissingEmbeddings(limit = 100): Promise<{
		factsUpdated: number;
		casesUpdated: number;
	}> {
		const factsMissing = await this.database.query.facts.findMany({
			where: isNull(schema.facts.embedding),
			limit,
		});
		for (const fact of factsMissing) {
			await this.refreshFactEmbeddingById(fact.id);
		}

		const casesMissing = await this.database.query.cases.findMany({
			where: isNull(schema.cases.embedding),
			limit,
		});
		for (const row of casesMissing) {
			await this.refreshCaseEmbeddingById(row.id);
		}

		return {
			factsUpdated: factsMissing.length,
			casesUpdated: casesMissing.length,
		};
	}
}

export async function semanticSearch(
	embeddingClient: EmbeddingClient,
	database: AppDatabase = db,
	args: unknown,
): Promise<SemanticSearchResult[]> {
	const { apartmentId, entityType, houseId, limit, propertyId, query } =
		semanticSearchSchema.parse(args);
	const queryEmbedding = await embeddingClient.embedQuery(
		formatSemanticSearchQuery(query),
	);
	const queryVector = toVectorSql(queryEmbedding);
	const results: SemanticSearchResult[] = [];

	if (entityType === "all" || entityType === "fact") {
		const score = sql<number>`1 - (${cosineDistance(schema.facts.embedding, queryVector)})`;
		const factFilters = [
			propertyId ? eq(schema.facts.propertyId, propertyId) : undefined,
			isNotNull(schema.facts.embedding),
			houseId ? eq(schema.factHouses.houseId, houseId) : undefined,
			apartmentId ? eq(schema.factApartments.apartmentId, apartmentId) : undefined,
		].filter(Boolean);

		const factRows = await database
			.select({
				id: schema.facts.id,
				propertyId: schema.facts.propertyId,
				category: schema.facts.category,
				key: schema.facts.key,
				value: schema.facts.value,
				isGoldStandard: schema.facts.isGoldStandard,
				confidenceScore: schema.facts.confidenceScore,
				sourceId: schema.sources.id,
				sourceFileId: schema.sources.fileId,
				sourceFileType: schema.sources.fileType,
				houseId: schema.factHouses.houseId,
				apartmentId: schema.factApartments.apartmentId,
				score,
			})
			.from(schema.facts)
			.innerJoin(schema.sources, eq(schema.sources.id, schema.facts.sourceId))
			.leftJoin(schema.factHouses, eq(schema.factHouses.factId, schema.facts.id))
			.leftJoin(
				schema.factApartments,
				eq(schema.factApartments.factId, schema.facts.id),
			)
			.where(factFilters.length > 0 ? and(...factFilters) : undefined)
			.orderBy((fields) => desc(fields.score))
			.limit(limit);

		const factIds = factRows.map((row) => row.id);
		const caseLinks = factIds.length
			? await database
					.select({
						factId: schema.factCases.factId,
						caseId: schema.factCases.caseId,
					})
					.from(schema.factCases)
					.where(inArray(schema.factCases.factId, factIds))
			: [];
		const caseIdsByFact = new Map<string, string[]>();
		for (const link of caseLinks) {
			const list = caseIdsByFact.get(link.factId) ?? [];
			list.push(link.caseId);
			caseIdsByFact.set(link.factId, list);
		}

		results.push(
			...factRows.map((row) => ({
				entityType: "fact" as const,
				id: row.id,
				score: row.score,
				snippet: `${row.key}: ${row.value}`,
				payload: {
					id: row.id,
					propertyId: row.propertyId,
					category: row.category,
					key: row.key,
					value: row.value,
					isGoldStandard: row.isGoldStandard,
					confidenceScore: row.confidenceScore,
					houseIds: row.houseId ? [row.houseId] : [],
					apartmentIds: row.apartmentId ? [row.apartmentId] : [],
					caseIds: caseIdsByFact.get(row.id) ?? [],
					source: {
						id: row.sourceId,
						fileId: row.sourceFileId,
						fileType: row.sourceFileType,
					},
				},
			})),
		);
	}

	if (entityType === "all" || entityType === "case") {
		const score = sql<number>`1 - (${cosineDistance(schema.cases.embedding, queryVector)})`;
		const caseFilters = [
			propertyId ? eq(schema.cases.propertyId, propertyId) : undefined,
			houseId ? eq(schema.cases.houseId, houseId) : undefined,
			apartmentId ? eq(schema.cases.apartmentId, apartmentId) : undefined,
			isNotNull(schema.cases.embedding),
		].filter(Boolean);

		const caseRows = await database
			.select({
				id: schema.cases.id,
				propertyId: schema.cases.propertyId,
				houseId: schema.cases.houseId,
				apartmentId: schema.cases.apartmentId,
				ownerUserId: schema.cases.ownerUserId,
				caseKey: schema.cases.caseKey,
				closurePredicate: schema.cases.closurePredicate,
				title: schema.cases.title,
				summary: schema.cases.summary,
				status: schema.cases.status,
				createdAt: schema.cases.createdAt,
				updatedAt: schema.cases.updatedAt,
				ownerName: schema.users.name,
				ownerEmail: schema.users.email,
				score,
			})
			.from(schema.cases)
			.innerJoin(schema.users, eq(schema.users.id, schema.cases.ownerUserId))
			.where(caseFilters.length > 0 ? and(...caseFilters) : undefined)
			.orderBy((fields) => desc(fields.score))
			.limit(limit);

		results.push(
			...caseRows.map((row) => ({
				entityType: "case" as const,
				id: row.id,
				score: row.score,
				snippet: row.summary,
				payload: {
					id: row.id,
					propertyId: row.propertyId,
					houseId: row.houseId,
					apartmentId: row.apartmentId,
					ownerUserId: row.ownerUserId,
					caseKey: row.caseKey,
					closurePredicate: row.closurePredicate,
					title: row.title,
					summary: row.summary,
					status: row.status,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
					owner: {
						id: row.ownerUserId,
						name: row.ownerName,
						email: row.ownerEmail,
					},
				},
			})),
		);
	}

	return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
