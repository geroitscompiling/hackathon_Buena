import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import { createMcpTools, handleMcpHttpRequest } from "#/mcp/server";
import { createPostgresTestDb } from "#/test/postgresTestDb";

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
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let toolRegistry: ReturnType<typeof createMcpTools>;

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		const db = testDb.db;

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
		await db.insert(schema.users).values({
			id: "user-1",
			name: "Alice Manager",
			email: "alice@example.com",
		});
		await db.insert(schema.sources).values({
			id: "source-1",
			fileId: "EMAIL-1.eml",
			fileType: "eml",
			ingestionDate: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(schema.facts).values({
			id: "fact-1",
			propertyId: "LIE-001",
			category: "maintenance",
			key: "door_status",
			value: "needs repair",
			sourceId: "source-1",
			isGoldStandard: false,
			confidenceScore: 0.9,
		});
		await db.insert(schema.cases).values({
			id: "case-1",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
			ownerUserId: "user-1",
			caseKey: "door|status|case",
			closurePredicate: "repair_completed",
			title: "Door repair",
			summary: "Follow up the broken door issue",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});

		toolRegistry = createMcpTools(db as never);
	});

	afterAll(async () => {
		await testDb?.close();
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
		expect(toolsPayload).toContain('"name":"semantic_search"');
		expect(toolsPayload).toContain('"name":"get_related_cases"');
		expect(toolsPayload).toContain('"name":"get_related_facts"');
		expect(toolsPayload).toContain('"name":"get_case_context_bundle"');

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
		expect(callPayload).toContain("Immanuelkirchstrasse 26");
	});

	it("returns MCP error payload for invalid semantic_search requests", async () => {
		const callResponse = await handleMcpHttpRequest(
			createMcpPostRequest(
				{
					jsonrpc: "2.0",
					id: 11,
					method: "tools/call",
					params: {
						name: "semantic_search",
						arguments: {
							query: "",
							entityType: "all",
							limit: 5,
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
		const payload = await callResponse.text();
		expect(payload).toContain('"error"');
		expect(payload).toContain("query");
	});

	it("returns case context bundle and validates required caseId", async () => {
		const bundleResponse = await handleMcpHttpRequest(
			createMcpPostRequest(
				{
					jsonrpc: "2.0",
					id: 12,
					method: "tools/call",
					params: {
						name: "get_case_context_bundle",
						arguments: {
							caseId: "case-1",
							relatedCasesLimit: 2,
							relatedFactsLimit: 2,
						},
					},
				},
				{
					"mcp-protocol-version": "2025-03-26",
				},
			),
			toolRegistry,
		);
		expect(bundleResponse.status).toBe(200);
		const bundlePayload = await bundleResponse.text();
		expect(bundlePayload).toContain("case-1");
		expect(bundlePayload).toContain("relatedCases");
		expect(bundlePayload).toContain("relatedFacts");

		const invalidResponse = await handleMcpHttpRequest(
			createMcpPostRequest(
				{
					jsonrpc: "2.0",
					id: 13,
					method: "tools/call",
					params: {
						name: "get_case_context_bundle",
						arguments: {
							relatedCasesLimit: 2,
						},
					},
				},
				{
					"mcp-protocol-version": "2025-03-26",
				},
			),
			toolRegistry,
		);
		expect(invalidResponse.status).toBe(200);
		const invalidPayload = await invalidResponse.text();
		expect(invalidPayload).toContain('"error"');
		expect(invalidPayload).toContain("caseId");
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
