import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeAll, describe, expect, it } from "vitest";

import * as relations from "#/db/relations";
import * as schema from "#/db/schema";
import { createMcpTools, handleMcpHttpRequest } from "#/mcp/server";

function createMcpPostRequest(body: unknown, headers?: HeadersInit) {
	return new Request("http://localhost:3000/api/mcp", {
		method: "POST",
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			...headers,
		},
		body: JSON.stringify(body),
	});
}

describe("mcp http transport", () => {
	let sqlite: Database.Database;
	let toolRegistry: ReturnType<typeof createMcpTools>;

	beforeAll(async () => {
		sqlite = new Database(":memory:");
		const db = drizzle(sqlite, {
			schema: {
				...schema,
				...relations,
			},
		});

		sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "properties" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "houses" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "apartments" (
        "id" text PRIMARY KEY NOT NULL,
        "houseId" text NOT NULL,
        "name" text NOT NULL,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action
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
        "propertyId" text NOT NULL,
        "category" text NOT NULL,
        "key" text NOT NULL,
        "value" text NOT NULL,
        "sourceId" text NOT NULL,
        "isGoldStandard" integer NOT NULL,
        "confidenceScore" real NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "cases" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "houseId" text,
        "apartmentId" text,
        "ownerUserId" text NOT NULL,
        "title" text NOT NULL,
        "summary" text NOT NULL,
        "status" text NOT NULL,
        "createdAt" text NOT NULL,
        "updatedAt" text NOT NULL,
        FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_houses" (
        "factId" text NOT NULL,
        "houseId" text NOT NULL,
        PRIMARY KEY ("factId", "houseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_apartments" (
        "factId" text NOT NULL,
        "apartmentId" text NOT NULL,
        PRIMARY KEY ("factId", "apartmentId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("apartmentId") REFERENCES "apartments"("id") ON UPDATE no action ON DELETE no action
      );

      CREATE TABLE IF NOT EXISTS "fact_cases" (
        "factId" text NOT NULL,
        "caseId" text NOT NULL,
        PRIMARY KEY ("factId", "caseId"),
        FOREIGN KEY ("factId") REFERENCES "facts"("id") ON UPDATE no action ON DELETE no action,
        FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON UPDATE no action ON DELETE no action
      );
    `);

		await db.insert(schema.properties).values({
			id: "LIE-001",
			name: "Immanuelkirchstrasse 26",
		});
		await db.insert(schema.houses).values({
			id: "LIE-001-H1",
			propertyId: "LIE-001",
			name: "Front House",
		});
		await db.insert(schema.apartments).values({
			id: "LIE-001-H1-A1",
			houseId: "LIE-001-H1",
			name: "Unit 1",
		});

		toolRegistry = createMcpTools(db as never);
	});

	it("handles initialize requests over streamable HTTP", async () => {
		const response = await handleMcpHttpRequest(
			createMcpPostRequest({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2025-03-26",
					capabilities: {},
					clientInfo: {
						name: "vitest-client",
						version: "1.0.0",
					},
				},
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");

		const payload = await response.text();
		expect(payload).toContain('"protocolVersion":"2025-03-26"');
		expect(payload).toContain('"name":"buena-remote-app"');
	});

	it("lists tools and calls them through the same /api/mcp endpoint", async () => {
		const toolsResponse = await handleMcpHttpRequest(
			createMcpPostRequest(
				{
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {},
				},
				{
					"mcp-protocol-version": "2025-03-26",
				},
			),
			toolRegistry,
		);

		expect(toolsResponse.status).toBe(200);
		const toolsPayload = await toolsResponse.text();
		expect(toolsPayload).toContain('"name":"list_property_hierarchies"');
		expect(toolsPayload).not.toContain('"name":"list_properties"');
		expect(toolsPayload).not.toContain('"name":"get_property_hierarchy"');

		const callResponse = await handleMcpHttpRequest(
			createMcpPostRequest(
				{
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "list_property_hierarchies",
						arguments: {
							limit: 1,
						},
					},
				},
				{
					"mcp-protocol-version": "2025-03-26",
				},
			),
			toolRegistry,
		);

		expect(callResponse.status).toBe(200);
		const callPayload = await callResponse.text();
		expect(callPayload).toContain('"type":"text"');
		expect(callPayload).toContain('"content"');
		expect(callPayload).toContain("Immanuelkirchstrasse 26");
	});

	it("rejects unsupported methods for stateless streamable HTTP", async () => {
		const response = await handleMcpHttpRequest(
			new Request("http://localhost:3000/api/mcp", {
				method: "GET",
			}),
		);

		expect(response.status).toBe(405);
	});
});
