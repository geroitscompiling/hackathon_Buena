import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { ZodTypeAny } from "zod";
import { z } from "zod";

import type { AppDrizzleDatabase } from "#/db/drizzleTypes.ts";
import * as schema from "#/db/schema";
import type { CaseClosurePredicate } from "#/engine/case/caseDomain";
import { CaseLifecycleService, factSatisfiesClosurePredicate, loadFactScopes } from "#/engine/services/CaseLifecycleService";
import { listCases, listCasesSchema } from "#/services/cases";
import { listFacts, listFactsSchema } from "#/services/facts";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import {
	listPropertiesSchema,
	listPropertyHierarchies,
} from "#/services/properties";
import {
	type SemanticIndexService,
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
	/** Receives raw MCP tool arguments; use {@link withParsedArgs} so the inner handler is typed. */
	execute: (args: unknown) => Promise<unknown>;
};

function withParsedArgs<S extends ZodTypeAny>(
	schema: S,
	run: (args: z.infer<S>) => Promise<unknown> | unknown,
): (raw: unknown) => Promise<unknown> {
	return async (raw) => Promise.resolve(run(schema.parse(raw)));
}

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

const searchCaseHistorySchema = z
	.object({
		caseId: z.string().trim().min(1),
		limit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

const searchRelatedFactsSchema = z
	.object({
		caseId: z.string().trim().min(1),
		query: z.string().trim().min(1).optional(),
		limit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

const searchRelatedCasesSchema = z
	.object({
		caseId: z.string().trim().min(1),
		query: z.string().trim().min(1).optional(),
		limit: z.coerce.number().int().positive().max(25).default(5),
	})
	.strict();

const getCaseClosureEvidenceSchema = z
	.object({
		caseId: z.string().trim().min(1),
		limit: z.coerce.number().int().positive().max(25).default(10),
	})
	.strict();

const listTestfilesDirectorySchema = z
	.object({
		relativePath: z.string().trim().default(""),
		limit: z.coerce.number().int().positive().max(200).default(100),
	})
	.strict();

const findTestfilesFilesSchema = z
	.object({
		relativePath: z.string().trim().default(""),
		pattern: z.string().trim().min(1).optional(),
		limit: z.coerce.number().int().positive().max(200).default(100),
	})
	.strict();

const grepTestfilesSchema = z
	.object({
		relativePath: z.string().trim().default(""),
		query: z.string().trim().min(1),
		limit: z.coerce.number().int().positive().max(100).default(20),
	})
	.strict();

const readTestfilesFileSchema = z
	.object({
		relativePath: z.string().trim().min(1),
		maxLines: z.coerce.number().int().positive().max(400).default(120),
	})
	.strict();

const linkFactToCaseSchema = z
	.object({
		caseId: z.string().trim().min(1),
		factId: z.string().trim().min(1),
	})
	.strict();

const updateCaseSummarySchema = z
	.object({
		caseId: z.string().trim().min(1),
		summary: z.string().trim().min(1),
	})
	.strict();

const updateCaseTitleSchema = z
	.object({
		caseId: z.string().trim().min(1),
		title: z.string().trim().min(1),
	})
	.strict();

const updateCaseStatusSchema = z
	.object({
		caseId: z.string().trim().min(1),
		status: z.string().trim().min(1),
	})
	.strict();

const requestCaseClosureSchema = z
	.object({
		caseId: z.string().trim().min(1),
		proposedConfidence: z.coerce.number().min(0).max(1),
		confidenceThreshold: z.coerce.number().min(0).max(1).default(0.8),
		contextSummary: z.string().trim().min(1),
		nowIso: z.string().trim().min(1).optional(),
	})
	.strict();

type CaseRowWithScope = Awaited<ReturnType<typeof loadCaseForContext>>;

function sanitizeToolPayload(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sanitizeToolPayload);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !["embedding", "embeddings", "vector", "vectors"].includes(key.toLowerCase()))
				.map(([key, nested]) => [key, sanitizeToolPayload(nested)]),
		);
	}

	return value;
}

const TESTFILES_ROOT = path.resolve("testfiles");
const DEFAULT_TEXT_EXTENSIONS = new Set([
	".csv",
	".eml",
	".json",
	".md",
	".txt",
	".xml",
	".yml",
	".yaml",
	".log",
]);

function normalizeRelativePath(relativePath: string) {
	return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveTestfilesPath(relativePath: string) {
	const normalizedPath = normalizeRelativePath(relativePath);
	const absolutePath = path.resolve(TESTFILES_ROOT, normalizedPath);
	const relativeToRoot = path.relative(TESTFILES_ROOT, absolutePath);

	if (
		relativeToRoot.startsWith("..") ||
		path.isAbsolute(relativeToRoot)
	) {
		throw new Error("Requested path must stay within the testfiles directory.");
	}

	return {
		absolutePath,
		relativePath: relativeToRoot === "" ? "" : relativeToRoot.split(path.sep).join("/"),
	};
}

function isTextPreviewPath(filePath: string) {
	return DEFAULT_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function listTestfilesDirectory(args: z.infer<typeof listTestfilesDirectorySchema>) {
	const { absolutePath, relativePath } = resolveTestfilesPath(args.relativePath);
	const targetStat = await stat(absolutePath);

	if (!targetStat.isDirectory()) {
		throw new Error(`Path is not a directory inside testfiles: ${relativePath || "."}`);
	}

	const entries = await readdir(absolutePath, { withFileTypes: true });
	return {
		root: "testfiles",
		relativePath,
		entries: entries
			.sort((left, right) => left.name.localeCompare(right.name))
			.slice(0, args.limit)
			.map((entry) => ({
				name: entry.name,
				path: [relativePath, entry.name].filter(Boolean).join("/"),
				type: entry.isDirectory() ? "directory" : "file",
			})),
	};
}

async function findFilesRecursively(
	absoluteDir: string,
	baseRelativePath: string,
	matches: string[],
	pattern: string | undefined,
	limit: number,
): Promise<void> {
	if (matches.length >= limit) {
		return;
	}

	const entries = await readdir(absoluteDir, { withFileTypes: true });
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (matches.length >= limit) {
			return;
		}

		const entryRelativePath = [baseRelativePath, entry.name].filter(Boolean).join("/");
		const entryAbsolutePath = path.join(absoluteDir, entry.name);

		if (entry.isDirectory()) {
			await findFilesRecursively(entryAbsolutePath, entryRelativePath, matches, pattern, limit);
			continue;
		}

		if (!pattern || entryRelativePath.toLowerCase().includes(pattern.toLowerCase())) {
			matches.push(entryRelativePath);
		}
	}
}

async function findTestfilesFiles(args: z.infer<typeof findTestfilesFilesSchema>) {
	const { absolutePath, relativePath } = resolveTestfilesPath(args.relativePath);
	const targetStat = await stat(absolutePath);
	const matches: string[] = [];

	if (targetStat.isDirectory()) {
		await findFilesRecursively(absolutePath, relativePath, matches, args.pattern, args.limit);
	} else if (!args.pattern || relativePath.toLowerCase().includes(args.pattern.toLowerCase())) {
		matches.push(relativePath);
	}

	return {
		root: "testfiles",
		relativePath,
		matches,
	};
}

async function readTextFileLines(absolutePath: string, maxLines: number) {
	if (!isTextPreviewPath(absolutePath)) {
		throw new Error("Only text-like files inside testfiles can be previewed.");
	}

	const raw = await readFile(absolutePath, "utf8");
	return raw.split(/\r?\n/).slice(0, maxLines);
}

async function grepTestfiles(args: z.infer<typeof grepTestfilesSchema>) {
	const { absolutePath, relativePath } = resolveTestfilesPath(args.relativePath);
	const targetStat = await stat(absolutePath);
	const matches: Array<{ path: string; lineNumber: number; line: string }> = [];
	const loweredQuery = args.query.toLowerCase();

	const inspectFile = async (fileAbsolutePath: string, fileRelativePath: string) => {
		if (!isTextPreviewPath(fileAbsolutePath) || matches.length >= args.limit) {
			return;
		}
		const lines = await readTextFileLines(fileAbsolutePath, 2000);
		lines.forEach((line, index) => {
			if (matches.length >= args.limit) {
				return;
			}
			if (line.toLowerCase().includes(loweredQuery)) {
				matches.push({
					path: fileRelativePath,
					lineNumber: index + 1,
					line,
				});
			}
		});
	};

	if (targetStat.isDirectory()) {
		const files = await findTestfilesFiles({
			relativePath,
			limit: 200,
		});
		for (const fileRelativePath of files.matches) {
			await inspectFile(resolveTestfilesPath(fileRelativePath).absolutePath, fileRelativePath);
			if (matches.length >= args.limit) {
				break;
			}
		}
	} else {
		await inspectFile(absolutePath, relativePath);
	}

	return {
		root: "testfiles",
		relativePath,
		query: args.query,
		matches,
	};
}

async function readTestfilesFile(args: z.infer<typeof readTestfilesFileSchema>) {
	const { absolutePath, relativePath } = resolveTestfilesPath(args.relativePath);
	const targetStat = await stat(absolutePath);

	if (!targetStat.isFile()) {
		throw new Error(`Path is not a file inside testfiles: ${relativePath}`);
	}

	const lines = await readTextFileLines(absolutePath, args.maxLines);
	return {
		root: "testfiles",
		relativePath,
		content: lines.join("\n"),
		truncated: targetStat.size > Buffer.byteLength(lines.join("\n"), "utf8"),
	};
}

async function loadCaseForContext(database: AppDatabase, caseId: string) {
	const caseRow = await database.query.cases.findFirst({
		where: (cases, { eq }) => eq(cases.id, caseId),
		with: {
			apartment: true,
			house: true,
			owner: true,
			property: true,
		},
	});

	if (!caseRow) {
		throw new Error(`Case not found: ${caseId}`);
	}

	return caseRow;
}

function scopeFiltersForCase(caseRow: CaseRowWithScope) {
	return {
		propertyId: caseRow.propertyId,
		houseId: caseRow.apartmentId ? undefined : caseRow.houseId ?? undefined,
		apartmentId: caseRow.apartmentId ?? undefined,
	};
}

function buildCaseSearchQuery(caseRow: CaseRowWithScope, query?: string) {
	return query?.trim() || `${caseRow.title}. ${caseRow.summary}`.trim();
}

async function fallbackFactsForCase(
	database: AppDatabase,
	caseRow: CaseRowWithScope,
	limit: number,
) {
	const scope = scopeFiltersForCase(caseRow);
	const facts = await listFacts(database, {
		propertyId: scope.propertyId,
		limit: Math.max(limit * 3, limit),
	});

	return facts
		.filter((fact) =>
			scope.apartmentId
				? fact.apartmentIds.includes(scope.apartmentId)
				: scope.houseId
					? fact.houseIds.includes(scope.houseId)
					: true,
		)
		.slice(0, limit)
		.map((fact) => sanitizeToolPayload(fact));
}

async function fallbackCasesForCase(
	database: AppDatabase,
	caseRow: CaseRowWithScope,
	limit: number,
) {
	const scope = scopeFiltersForCase(caseRow);
	const cases = await listCases(database, {
		propertyId: scope.propertyId,
		houseId: scope.houseId,
		apartmentId: scope.apartmentId,
		limit: Math.max(limit + 1, limit),
	});

	return cases
		.filter((candidate) => candidate.id !== caseRow.id)
		.slice(0, limit)
		.map((candidate) => sanitizeToolPayload(candidate));
}

async function searchFactsForCase(
	database: AppDatabase,
	caseRow: CaseRowWithScope,
	limit: number,
	query: string,
	options: { embeddingClient?: EmbeddingClient } = {},
) {
	const scope = scopeFiltersForCase(caseRow);
	const semanticResults = await runSemanticSearchSafe(
		database,
		{
			query,
			entityType: "fact",
			goldStandard: "all",
			...scope,
			limit,
		},
		options,
	);

	if (semanticResults.length > 0) {
		return semanticResults.map((result) => sanitizeToolPayload(result.payload));
	}

	return fallbackFactsForCase(database, caseRow, limit);
}

async function searchCasesForCase(
	database: AppDatabase,
	caseRow: CaseRowWithScope,
	limit: number,
	query: string,
	options: { embeddingClient?: EmbeddingClient } = {},
) {
	const scope = scopeFiltersForCase(caseRow);
	const semanticResults = await runSemanticSearchSafe(
		database,
		{
			query,
			entityType: "case",
			goldStandard: "all",
			...scope,
			limit: limit + 1,
		},
		options,
	);

	if (semanticResults.length > 0) {
		return semanticResults
			.filter((result) => result.id !== caseRow.id)
			.slice(0, limit)
			.map((result) => sanitizeToolPayload(result.payload));
	}

	return fallbackCasesForCase(database, caseRow, limit);
}

async function getCaseClosureEvidence(
	database: AppDatabase,
	args: z.infer<typeof getCaseClosureEvidenceSchema>,
) {
	const caseRow = await loadCaseForContext(database, args.caseId);
	if (!caseRow.closurePredicate) {
		return {
			caseId: args.caseId,
			closurePredicate: null,
			matchingFacts: [],
		};
	}
	const closurePredicate = caseRow.closurePredicate as CaseClosurePredicate;

	const facts = await database.query.facts.findMany({
		where: (fact, { and, eq }) =>
			and(eq(fact.propertyId, caseRow.propertyId), eq(fact.key, closurePredicate)),
		limit: args.limit,
		with: {
			source: true,
			houseLinks: true,
			apartmentLinks: true,
		},
	});
	const scopeMap = await loadFactScopes(database, facts.map((fact) => fact.id));
	const matchingFacts = facts
		.filter((fact) => factSatisfiesClosurePredicate(fact.key, fact.value, closurePredicate))
		.filter((fact) => {
			const scope = scopeMap.get(fact.id);
			if (!scope) {
				return false;
			}
			if (caseRow.apartmentId) {
				return scope.scopeType === "apartment" && scope.apartmentId === caseRow.apartmentId;
			}
			if (caseRow.houseId) {
				return (
					(scope.scopeType === "house" && scope.houseId === caseRow.houseId) ||
					(scope.scopeType === "apartment" && scope.houseId === caseRow.houseId)
				);
			}
			return scope.propertyId === caseRow.propertyId;
		})
		.map((fact) =>
			sanitizeToolPayload({
				id: fact.id,
				key: fact.key,
				value: fact.value,
				category: fact.category,
				confidenceScore: fact.confidenceScore,
				source: {
					id: fact.source.id,
					fileId: fact.source.fileId,
					fileType: fact.source.fileType,
					ingestionDate: fact.source.ingestionDate,
				},
			}),
		);

	return {
		caseId: args.caseId,
		closurePredicate: caseRow.closurePredicate,
		matchingFacts,
	};
}

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
			goldStandard: "all",
			...scopeFilters,
			limit: args.relatedCasesLimit + 1,
		}, options)
	)
		.filter((row) => row.entityType === "case" && row.id !== caseRow.id)
		.slice(0, args.relatedCasesLimit);
	const relatedFacts = await runSemanticSearchSafe(dbHandle, {
		query: queryText,
		entityType: "fact",
		goldStandard: "all",
		...scopeFilters,
		limit: args.relatedFactsLimit,
	}, options);

	return {
		case: sanitizeToolPayload(caseRow),
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
	options: {
		embeddingClient?: EmbeddingClient;
		lifecycle?: Pick<CaseLifecycleService, "evaluateGuardedClosureAction">;
		semanticIndexService?: Pick<SemanticIndexService, "refreshCaseEmbeddingById">;
	} = {},
) {
	const embeddingClientFactory = () =>
		options.embeddingClient ?? new GeminiEmbeddingService();
	const lifecycle =
		options.lifecycle ??
		(database
			? new CaseLifecycleService(database as never, {
					semanticIndexService: options.semanticIndexService,
				})
			: undefined);
	return [
		{
			name: "list_property_hierarchies",
			description:
				"Lists properties together with their houses and apartments.",
			schema: listPropertiesSchema,
			execute: withParsedArgs(listPropertiesSchema, (args) =>
				listPropertyHierarchies(database, args),
			),
		},
		{
			name: "list_facts",
			description:
				"Lists facts with optional filtering by property, category, key, or source.",
			schema: listFactsSchema,
			execute: withParsedArgs(listFactsSchema, (args) => listFacts(database, args)),
		},
		{
			name: "list_cases",
			description:
				"Lists cases with optional filtering by scope, status, or owner.",
			schema: listCasesSchema,
			execute: withParsedArgs(listCasesSchema, (args) => listCases(database, args)),
		},
		{
			name: "semantic_search",
			description:
				"Searches facts and cases by natural language using vector similarity.",
			schema: semanticSearchToolSchema,
			execute: withParsedArgs(semanticSearchToolSchema, (args) =>
				semanticSearch(embeddingClientFactory(), database, args),
			),
		},
		{
			name: "get_related_cases",
			description:
				"Gets semantically related cases for an existing case within its scope.",
			schema: getRelatedCasesSchema,
			execute: withParsedArgs(getRelatedCasesSchema, async (parsed) => {
				const bundle = await getCaseContextBundle(
					database,
					{
						caseId: parsed.caseId,
						relatedCasesLimit: parsed.limit,
						relatedFactsLimit: 1,
					},
					options,
				);
				return sanitizeToolPayload(onlyCases(bundle.relatedCases));
			}),
		},
		{
			name: "get_related_facts",
			description:
				"Gets semantically related facts for an existing case within its scope.",
			schema: getRelatedFactsSchema,
			execute: withParsedArgs(getRelatedFactsSchema, async (parsed) => {
				const bundle = await getCaseContextBundle(
					database,
					{
						caseId: parsed.caseId,
						relatedCasesLimit: 1,
						relatedFactsLimit: parsed.limit,
					},
					options,
				);
				return sanitizeToolPayload(onlyFacts(bundle.relatedFacts));
			}),
		},
		{
			name: "get_case_context_bundle",
			description:
				"Returns a single case context bundle with related cases and facts.",
			schema: getCaseContextBundleSchema,
			execute: withParsedArgs(getCaseContextBundleSchema, async (args) =>
				sanitizeToolPayload(
					await getCaseContextBundle(database, args, {
						embeddingClient: options.embeddingClient,
					}),
				),
			),
		},
		{
			name: "search_case_history",
			description:
				"Returns scoped historical facts and cases related to the current case.",
			schema: searchCaseHistorySchema,
			execute: withParsedArgs(searchCaseHistorySchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for search_case_history.");
				}
				const caseRow = await loadCaseForContext(database, args.caseId);
				const query = buildCaseSearchQuery(caseRow);
				const [relatedFacts, relatedCases] = await Promise.all([
					searchFactsForCase(database, caseRow, args.limit, query, options),
					searchCasesForCase(database, caseRow, args.limit, query, options),
				]);
				return sanitizeToolPayload({
					caseId: args.caseId,
					relatedFacts,
					relatedCases,
				});
			}),
		},
		{
			name: "search_related_facts",
			description:
				"Searches scoped related facts for the current case.",
			schema: searchRelatedFactsSchema,
			execute: withParsedArgs(searchRelatedFactsSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for search_related_facts.");
				}
				const caseRow = await loadCaseForContext(database, args.caseId);
				return searchFactsForCase(
					database,
					caseRow,
					args.limit,
					buildCaseSearchQuery(caseRow, args.query),
					options,
				);
			}),
		},
		{
			name: "search_related_cases",
			description:
				"Searches scoped related cases for the current case.",
			schema: searchRelatedCasesSchema,
			execute: withParsedArgs(searchRelatedCasesSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for search_related_cases.");
				}
				const caseRow = await loadCaseForContext(database, args.caseId);
				return searchCasesForCase(
					database,
					caseRow,
					args.limit,
					buildCaseSearchQuery(caseRow, args.query),
					options,
				);
			}),
		},
		{
			name: "get_case_closure_evidence",
			description:
				"Returns scoped facts that satisfy the case closure predicate.",
			schema: getCaseClosureEvidenceSchema,
			execute: withParsedArgs(getCaseClosureEvidenceSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for get_case_closure_evidence.");
				}
				return getCaseClosureEvidence(database, args);
			}),
		},
		{
			name: "list_testfiles_directory",
			description:
				"Lists files and subdirectories inside the read-only testfiles dataset.",
			schema: listTestfilesDirectorySchema,
			execute: withParsedArgs(listTestfilesDirectorySchema, (args) =>
				listTestfilesDirectory(args),
			),
		},
		{
			name: "find_testfiles_files",
			description:
				"Recursively finds files inside the read-only testfiles dataset.",
			schema: findTestfilesFilesSchema,
			execute: withParsedArgs(findTestfilesFilesSchema, (args) =>
				findTestfilesFiles(args),
			),
		},
		{
			name: "grep_testfiles",
			description:
				"Searches text-like files inside the read-only testfiles dataset for matching lines.",
			schema: grepTestfilesSchema,
			execute: withParsedArgs(grepTestfilesSchema, (args) => grepTestfiles(args)),
		},
		{
			name: "read_testfiles_file",
			description:
				"Reads a bounded preview of a text-like file inside the read-only testfiles dataset.",
			schema: readTestfilesFileSchema,
			execute: withParsedArgs(readTestfilesFileSchema, (args) =>
				readTestfilesFile(args),
			),
		},
		{
			name: "link_fact_to_case",
			description:
				"Creates an explicit evidence link between a fact and a case.",
			schema: linkFactToCaseSchema,
			execute: withParsedArgs(linkFactToCaseSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for link_fact_to_case.");
				}
				try {
					await database.insert(schema.factCases).values({
						caseId: args.caseId,
						factId: args.factId,
					});
				} catch {
					/* duplicate PK */
				}
				return {
					caseId: args.caseId,
					factId: args.factId,
					linked: true,
				};
			}),
		},
		{
			name: "update_case_summary",
			description: "Updates the summary of an existing case.",
			schema: updateCaseSummarySchema,
			execute: withParsedArgs(updateCaseSummarySchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for update_case_summary.");
				}
				await database
					.update(schema.cases)
					.set({
						summary: args.summary,
						updatedAt: new Date().toISOString(),
					})
					.where(eq(schema.cases.id, args.caseId));
				await options.semanticIndexService?.refreshCaseEmbeddingById(args.caseId);
				return {
					caseId: args.caseId,
					summary: args.summary,
					updated: true,
				};
			}),
		},
		{
			name: "update_case_title",
			description: "Updates the title of an existing case.",
			schema: updateCaseTitleSchema,
			execute: withParsedArgs(updateCaseTitleSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for update_case_title.");
				}
				await database
					.update(schema.cases)
					.set({
						title: args.title,
						updatedAt: new Date().toISOString(),
					})
					.where(eq(schema.cases.id, args.caseId));
				await options.semanticIndexService?.refreshCaseEmbeddingById(args.caseId);
				return {
					caseId: args.caseId,
					title: args.title,
					updated: true,
				};
			}),
		},
		{
			name: "update_case_status",
			description: "Updates the status of an existing case.",
			schema: updateCaseStatusSchema,
			execute: withParsedArgs(updateCaseStatusSchema, async (args) => {
				if (!database) {
					throw new Error("Database handle is required for update_case_status.");
				}
				await database
					.update(schema.cases)
					.set({
						status: args.status,
						updatedAt: new Date().toISOString(),
					})
					.where(eq(schema.cases.id, args.caseId));
				await options.semanticIndexService?.refreshCaseEmbeddingById(args.caseId);
				return {
					caseId: args.caseId,
					status: args.status,
					updated: true,
				};
			}),
		},
		{
			name: "request_case_closure",
			description:
				"Requests guarded closure of a case through the lifecycle service.",
			schema: requestCaseClosureSchema,
			execute: withParsedArgs(requestCaseClosureSchema, async (args) => {
				if (!database || !lifecycle) {
					throw new Error("Database handle is required for request_case_closure.");
				}
				const caseRow = await loadCaseForContext(database, args.caseId);
				const result = await lifecycle.evaluateGuardedClosureAction({
					caseId: args.caseId,
					propertyId: caseRow.propertyId,
					proposedAction: "close_case",
					proposedConfidence: args.proposedConfidence,
					confidenceThreshold: args.confidenceThreshold,
					nowIso: args.nowIso ?? new Date().toISOString(),
					contextSummary: args.contextSummary,
				});
				return sanitizeToolPayload({
					caseId: args.caseId,
					result,
				});
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

		const result = await tool.execute(request.params.arguments ?? {});

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
