import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as relations from "#/db/relations";
import * as schema from "#/db/schema";

const DEFAULT_DATABASE_URL =
	"postgres://postgres:postgres@localhost:5433/buena";

export async function createPostgresTestDb() {
	const candidate = process.env.DATABASE_URL?.trim();
	let baseUrl = DEFAULT_DATABASE_URL;
	if (candidate) {
		try {
			const parsed = new URL(candidate);
			if (
				parsed.protocol === "postgres:" ||
				parsed.protocol === "postgresql:"
			) {
				baseUrl = candidate;
			}
		} catch {
			baseUrl = DEFAULT_DATABASE_URL;
		}
	}
	const adminUrl = new URL(baseUrl);
	adminUrl.pathname = "/postgres";

	const databaseName = `buena_test_${randomUUID().replaceAll("-", "")}`;
	const adminClient = postgres(adminUrl.toString(), {
		prepare: false,
		max: 1,
	});
	await adminClient.unsafe(`CREATE DATABASE "${databaseName}"`);

	const testUrl = new URL(baseUrl);
	testUrl.pathname = `/${databaseName}`;

	const queryClient = postgres(testUrl.toString(), {
		prepare: false,
		max: 1,
	});
	await bootstrapAppSchema(queryClient);

	const db = drizzle(queryClient, {
		schema: {
			...schema,
			...relations,
		},
	});

	async function close() {
		await queryClient.end();
		await adminClient.unsafe(`
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE datname = '${databaseName}'
			  AND pid <> pg_backend_pid()
		`);
		await adminClient.unsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
		await adminClient.end();
	}

	return { db, queryClient, close };
}

export async function bootstrapAppSchema(
	client: postgres.Sql<Record<string, unknown>>,
) {
	await client.unsafe(`
		CREATE EXTENSION IF NOT EXISTS vector;

		CREATE TABLE IF NOT EXISTS "properties" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "houses" (
			"id" text PRIMARY KEY NOT NULL,
			"propertyId" text NOT NULL REFERENCES "properties"("id"),
			"name" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "apartments" (
			"id" text PRIMARY KEY NOT NULL,
			"houseId" text NOT NULL REFERENCES "houses"("id"),
			"name" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "users" (
			"id" text PRIMARY KEY NOT NULL,
			"name" text NOT NULL,
			"email" text
		);

		CREATE TABLE IF NOT EXISTS "sources" (
			"id" text PRIMARY KEY NOT NULL,
			"fileId" text NOT NULL,
			"fileType" text NOT NULL,
			"ingestionDate" text NOT NULL,
			"documentDate" text,
			"anchorReference" text
		);

		CREATE TABLE IF NOT EXISTS "facts" (
			"id" text PRIMARY KEY NOT NULL,
			"propertyId" text NOT NULL REFERENCES "properties"("id"),
			"category" text NOT NULL,
			"key" text NOT NULL,
			"value" text NOT NULL,
			"sourceId" text NOT NULL REFERENCES "sources"("id"),
			"isGoldStandard" boolean NOT NULL,
			"confidenceScore" real NOT NULL,
			"embedding" vector(1536)
		);

		CREATE TABLE IF NOT EXISTS "cases" (
			"id" text PRIMARY KEY NOT NULL,
			"propertyId" text NOT NULL REFERENCES "properties"("id"),
			"houseId" text REFERENCES "houses"("id"),
			"apartmentId" text REFERENCES "apartments"("id"),
			"ownerUserId" text NOT NULL REFERENCES "users"("id"),
			"caseKey" text NOT NULL,
			"closurePredicate" text,
			"title" text NOT NULL,
			"summary" text NOT NULL,
			"status" text NOT NULL,
			"createdAt" text NOT NULL,
			"updatedAt" text NOT NULL,
			"embedding" vector(1536)
		);

		CREATE UNIQUE INDEX IF NOT EXISTS "cases_property_case_key"
			ON "cases" ("propertyId", "caseKey");
		CREATE INDEX IF NOT EXISTS "facts_embedding_hnsw"
			ON "facts" USING hnsw ("embedding" vector_cosine_ops);
		CREATE INDEX IF NOT EXISTS "cases_embedding_hnsw"
			ON "cases" USING hnsw ("embedding" vector_cosine_ops);

		CREATE TABLE IF NOT EXISTS "fact_houses" (
			"factId" text NOT NULL REFERENCES "facts"("id"),
			"houseId" text NOT NULL REFERENCES "houses"("id"),
			PRIMARY KEY ("factId", "houseId")
		);

		CREATE TABLE IF NOT EXISTS "fact_apartments" (
			"factId" text NOT NULL REFERENCES "facts"("id"),
			"apartmentId" text NOT NULL REFERENCES "apartments"("id"),
			PRIMARY KEY ("factId", "apartmentId")
		);

		CREATE TABLE IF NOT EXISTS "fact_cases" (
			"factId" text NOT NULL REFERENCES "facts"("id"),
			"caseId" text NOT NULL REFERENCES "cases"("id"),
			PRIMARY KEY ("factId", "caseId")
		);
	`);
}
