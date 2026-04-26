import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";

import * as relations from "#/db/relations";
import * as schema from "#/db/schema";

export async function createPostgresTestDb() {
	const rawClient = new PGlite({
		extensions: { vector },
	});
	const queryClient = Object.assign(rawClient, {
		end: async () => {
			await rawClient.close();
		},
	});
	await bootstrapAppSchema(queryClient);

	const db = drizzle(queryClient, {
		schema: {
			...schema,
			...relations,
		},
	});

	async function close() {
		await rawClient.close();
	}

	return { db, queryClient, close };
}

export async function bootstrapAppSchema(
	client: { exec: (sql: string) => Promise<unknown> },
) {
	await client.exec(`
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

		CREATE TABLE IF NOT EXISTS "case_action_traces" (
			"id" text PRIMARY KEY NOT NULL,
			"caseId" text NOT NULL REFERENCES "cases"("id"),
			"action" text NOT NULL,
			"decision" text NOT NULL,
			"reason" text NOT NULL,
			"confidenceScore" real NOT NULL,
			"confidenceThreshold" real NOT NULL,
			"evidenceFactIds" text NOT NULL,
			"contextSummary" text NOT NULL,
			"createdAt" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "agent_runs" (
			"id" text PRIMARY KEY NOT NULL,
			"caseId" text NOT NULL REFERENCES "cases"("id"),
			"model" text NOT NULL,
			"status" text NOT NULL,
			"finalRecommendationJson" text,
			"guardrailTraceId" text REFERENCES "case_action_traces"("id"),
			"startedAt" text NOT NULL,
			"finishedAt" text,
			"createdAt" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "agent_run_messages" (
			"id" text PRIMARY KEY NOT NULL,
			"agentRunId" text NOT NULL REFERENCES "agent_runs"("id"),
			"stepIndex" integer NOT NULL,
			"role" text NOT NULL,
			"content" text NOT NULL,
			"createdAt" text NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "agent_run_tool_calls" (
			"id" text PRIMARY KEY NOT NULL,
			"agentRunId" text NOT NULL REFERENCES "agent_runs"("id"),
			"stepIndex" integer NOT NULL,
			"toolName" text NOT NULL,
			"argumentsJson" text NOT NULL,
			"resultJson" text,
			"status" text NOT NULL,
			"error" text,
			"startedAt" text NOT NULL,
			"finishedAt" text,
			"createdAt" text NOT NULL
		);
	`);
}
