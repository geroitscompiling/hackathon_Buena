import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ZodTypeAny } from "zod";
import { z } from "zod";

import type { AppDrizzleDatabase } from "#/db/drizzleTypes.ts";
import { listCases, listCasesSchema } from "#/services/cases";
import { listFacts, listFactsSchema } from "#/services/facts";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import {
	listPropertiesSchema,
	listPropertyHierarchies,
} from "#/services/properties";
import {
	semanticSearch,
	semanticSearchSchema,
	type EmbeddingClient,
	type SemanticSearchResult,
} from "#/services/semanticIndex";

type AppDatabase = AppDrizzleDatabase;

type McpToolDefinition<TSchema extends ZodTypeAny> = {
	name: string;
	description: string;
	schema: TSchema;
	/** MCP passes parsed JSON; validated with `schema` at runtime via service `parse` calls. */
	execute: (args: unknown) => Promise<unknown>;
};

const semanticSearchToolSchema = semanticSearchSchema.strict();

const getRelatedCasesSchema = z
	.object({
		caseId: z.string().trim().min(1),
		limit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

const getRelatedFactsSchema = z
	.object({
		caseId: z.string().trim().min(1),
		limit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

const getCaseContextBundleSchema = z
	.object({
		caseId: z.string().trim().min(1),
		relatedCasesLimit: z.coerce.number().int().positive().max(25).default(5),
		relatedFactsLimit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

async function getCaseContextBundle(
	database: AppDatabase | undefined,
	args: z.infer<typeof getCaseContextBundleSchema>,
	options: { embeddingClient?: EmbeddingClient } = {},
) {
	const dbHandle = database;
	if (!dbHandle) {
		throw new Error("Database handle is required for get_case_context_bundle.");
	}
	const caseRow = await dbHandle.query.cases.findFirst({
		where: (cases, { eq }) => eq(cases.id, args.caseId),
		with: {
			apartment: true,
			house: true,
			owner: true,
			property: true,
		},
	});
	if (!caseRow) {
		throw new Error(`Case not found: ${args.caseId}`);
	}
	const queryText = `${caseRow.title}. ${caseRow.summary}`.trim();
	const scopeFilters = {
		propertyId: caseRow.propertyId,
		houseId: caseRow.houseId ?? undefined,
		apartmentId: caseRow.apartmentId ?? undefined,
	};

	const relatedCases = (
		await runSemanticSearchSafe(dbHandle, {
			query: queryText,
			entityType: "case",
			...scopeFilters,
			limit: args.relatedCasesLimit + 1,
		}, options)
	)
		.filter((row) => row.entityType === "case" && row.id !== caseRow.id)
		.slice(0, args.relatedCasesLimit);
	const relatedFacts = await runSemanticSearchSafe(dbHandle, {
		query: queryText,
		entityType: "fact",
		...scopeFilters,
		limit: args.relatedFactsLimit,
	}, options);

	return {
		case: caseRow,
		relatedCases,
		relatedFacts,
	};
}

function onlyCases(results: SemanticSearchResult[]): SemanticSearchResult[] {
	return results.filter((row) => row.entityType === "case");
}

function onlyFacts(results: SemanticSearchResult[]): SemanticSearchResult[] {
	return results.filter((row) => row.entityType === "fact");
}

async function runSemanticSearchSafe(
	database: AppDatabase,
	args: z.infer<typeof semanticSearchToolSchema>,
	options: { embeddingClient?: EmbeddingClient } = {},
): Promise<SemanticSearchResult[]> {
	try {
		const embedding = options.embeddingClient ?? new GeminiEmbeddingService();
		return await semanticSearch(embedding, database, args);
	} catch {
		return [];
	}
}

export function createMcpTools(
	database?: AppDatabase,
	options: { embeddingClient?: EmbeddingClient } = {},
) {
	const embeddingClientFactory = () =>
		options.embeddingClient ?? new GeminiEmbeddingService();
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
		{
			name: "semantic_search",
			description:
				"Searches facts and cases by natural language using vector similarity.",
			schema: semanticSearchToolSchema,
			execute: (args) =>
				semanticSearch(embeddingClientFactory(), database, args),
		},
		{
			name: "get_related_cases",
			description:
				"Gets semantically related cases for an existing case within its scope.",
			schema: getRelatedCasesSchema,
			execute: async (args: unknown) => {
				const parsed = getRelatedCasesSchema.parse(args);
				const bundle = await getCaseContextBundle(database, {
					caseId: parsed.caseId,
					relatedCasesLimit: parsed.limit,
					relatedFactsLimit: 1,
				}, options);
				return onlyCases(bundle.relatedCases);
			},
		},
		{
			name: "get_related_facts",
			description:
				"Gets semantically related facts for an existing case within its scope.",
			schema: getRelatedFactsSchema,
			execute: async (args: unknown) => {
				const parsed = getRelatedFactsSchema.parse(args);
				const bundle = await getCaseContextBundle(database, {
					caseId: parsed.caseId,
					relatedCasesLimit: 1,
					relatedFactsLimit: parsed.limit,
				}, options);
				return onlyFacts(bundle.relatedFacts);
			},
		},
		{
			name: "get_case_context_bundle",
			description:
				"Returns a single case context bundle with related cases and facts.",
			schema: getCaseContextBundleSchema,
			execute: (args: unknown) =>
				getCaseContextBundle(database, getCaseContextBundleSchema.parse(args), {
					embeddingClient: options.embeddingClient,
				}),
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
