import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import { z } from "zod";

import type { db } from "#/db/index";
import {
	listCases,
	listCasesSchema,
	listFacts,
	listFactsSchema,
	listPropertiesSchema,
	listPropertyHierarchies,
} from "#/db/queries";

type AppDatabase = typeof db;

type McpToolDefinition<TSchema extends ZodTypeAny> = {
	name: string;
	description: string;
	schema: TSchema;
	execute: (args: z.infer<TSchema>) => Promise<unknown>;
};

export function createMcpTools(database?: AppDatabase) {
	return [
		{
			name: "list_property_hierarchies",
			description:
				"Lists properties together with their houses and apartments.",
			schema: listPropertiesSchema,
			execute: (args) => listPropertyHierarchies(database, args),
		},
		{
			name: "list_facts",
			description:
				"Lists facts with optional filtering by property, category, key, or source.",
			schema: listFactsSchema,
			execute: (args) => listFacts(database, args),
		},
		{
			name: "list_cases",
			description:
				"Lists cases with optional filtering by scope, status, or owner.",
			schema: listCasesSchema,
			execute: (args) => listCases(database, args),
		},
	] as const satisfies readonly McpToolDefinition<ZodTypeAny>[];
}

export function listMcpTools<
	TTools extends readonly McpToolDefinition<ZodTypeAny>[],
>(tools: TTools) {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		inputSchema: z.toJSONSchema(tool.schema),
	}));
}

function createMcpServer<
	TTools extends readonly McpToolDefinition<ZodTypeAny>[],
>(tools: TTools) {
	const server = new Server(
		{ name: "buena-remote-app", version: "1.0.0" },
		{ capabilities: { tools: {} } },
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: listMcpTools(tools),
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const tool = tools.find((entry) => entry.name === request.params.name);

		if (!tool) {
			throw new Error(`Tool not found: ${request.params.name}`);
		}

		const result = await tool.execute(
			tool.schema.parse(request.params.arguments ?? {}),
		);

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(result),
				},
			],
		};
	});

	return server;
}

export async function handleMcpHttpRequest(
	request: Request,
	tools = createMcpTools(),
) {
	if (request.method !== "POST") {
		return Response.json(
			{
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Method not allowed.",
				},
				id: null,
			},
			{ status: 405 },
		);
	}

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
	});
	const server = createMcpServer(tools);

	await server.connect(transport);
	return await transport.handleRequest(request);
}
