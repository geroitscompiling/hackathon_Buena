import { describe, expect, it, vi } from "vitest";
import { generateText } from "ai";

import * as schema from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import { CaseLifecycleService } from "../CaseLifecycleService";
import { CaseAgentRuntime } from "../CaseAgentRuntime";

vi.mock("ai", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ai")>();
	return {
		...actual,
		generateText: vi.fn(actual.generateText),
	};
});

async function seedRuntimeCase() {
	const testDb = await createPostgresTestDb();
	const db = testDb.db;
	await db.insert(schema.properties).values({
		id: "LIE-013",
		name: "Runtime Property",
	});
	await db.insert(schema.houses).values({
		id: "LIE-013-H1",
		propertyId: "LIE-013",
		name: "House 1",
	});
	await db.insert(schema.apartments).values({
		id: "LIE-013-H1-A1",
		houseId: "LIE-013-H1",
		name: "Apartment 1",
	});
	await db.insert(schema.users).values({
		id: "user-1",
		name: "Owner",
		email: "owner@example.com",
	});
	await db.insert(schema.sources).values({
		id: "source-1",
		fileId: "EMAIL-2001.eml",
		fileType: "eml",
		ingestionDate: "2026-04-26T08:00:00.000Z",
	});
	await db.insert(schema.cases).values({
		id: "runtime-case-1",
		propertyId: "LIE-013",
		houseId: "LIE-013-H1",
		apartmentId: "LIE-013-H1-A1",
		ownerUserId: "user-1",
		caseKey: "a:LIE-013-H1-A1|invoice|runtime-case",
		closurePredicate: "invoice_paid",
		title: "Runtime case",
		summary: "Check invoice evidence",
		status: "open",
		createdAt: "2026-04-26T09:00:00.000Z",
		updatedAt: "2026-04-26T09:00:00.000Z",
	});
	await db.insert(schema.facts).values({
		id: "fact-1",
		propertyId: "LIE-013",
		category: "financial",
		key: "invoice_paid",
		value: "paid",
		sourceId: "source-1",
		isGoldStandard: false,
		confidenceScore: 0.98,
	});
	await db.insert(schema.factHouses).values({
		factId: "fact-1",
		houseId: "LIE-013-H1",
	});
	await db.insert(schema.factApartments).values({
		factId: "fact-1",
		apartmentId: "LIE-013-H1-A1",
	});
	await db.insert(schema.factCases).values({
		factId: "fact-1",
		caseId: "runtime-case-1",
	});
	return testDb;
}

async function seedPaymentDisputeCase() {
	const testDb = await createPostgresTestDb();
	const db = testDb.db;
	await db.insert(schema.properties).values({
		id: "LIE-099",
		name: "Payment Dispute Property",
	});
	await db.insert(schema.houses).values({
		id: "LIE-099-H1",
		propertyId: "LIE-099",
		name: "House 1",
	});
	await db.insert(schema.apartments).values({
		id: "LIE-099-H1-A1",
		houseId: "LIE-099-H1",
		name: "Apartment 1",
	});
	await db.insert(schema.users).values({
		id: "user-99",
		name: "Owner",
		email: "owner@example.com",
	});
	await db.insert(schema.sources).values({
		id: "source-99",
		fileId: "EMAIL-9999.eml",
		fileType: "eml",
		ingestionDate: "2026-04-26T08:00:00.000Z",
	});
	await db.insert(schema.cases).values({
		id: "runtime-case-99",
		propertyId: "LIE-099",
		houseId: "LIE-099-H1",
		apartmentId: "LIE-099-H1-A1",
		ownerUserId: "user-99",
		caseKey: "a:LIE-099-H1-A1|rent-warning|chantal-taesche",
		closurePredicate: "invoice_paid",
		title: "Rent warning for Chantal Täsche in EH-045",
		summary: "Tenant says the rent warning is wrong and claims the payment was already sent for EH-045.",
		status: "open",
		createdAt: "2026-04-26T09:00:00.000Z",
		updatedAt: "2026-04-26T09:00:00.000Z",
	});
	await db.insert(schema.facts).values({
		id: "fact-99",
		propertyId: "LIE-099",
		category: "communication",
		key: "tenant_statement",
		value: "Chantal Täsche says the rent payment for EH-045 was already made.",
		sourceId: "source-99",
		isGoldStandard: false,
		confidenceScore: 0.91,
	});
	await db.insert(schema.factHouses).values({
		factId: "fact-99",
		houseId: "LIE-099-H1",
	});
	await db.insert(schema.factApartments).values({
		factId: "fact-99",
		apartmentId: "LIE-099-H1-A1",
	});
	await db.insert(schema.factCases).values({
		factId: "fact-99",
		caseId: "runtime-case-99",
	});
	return testDb;
}

describe("CaseAgentRuntime", () => {
	it("injects baseline case context, persists transcript and tool calls, and routes closure through guardrails", async () => {
		const testDb = await seedRuntimeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);

		const connect = vi.fn(async () => {});
		const listTools = vi.fn(async () => ({
			tools: [{ name: "search_related_facts", description: "related facts", inputSchema: {} }],
		}));
		const callTool = vi.fn(async () => ({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						results: [
							{
								id: "fact-1",
								key: "invoice_paid",
								value: "paid",
							},
						],
					}),
				},
			],
			isError: false,
		}));
		const close = vi.fn(async () => {});

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				modelId: "google/gemini-2.5-flash",
				baseUrl: "http://localhost:3000",
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect,
					listTools,
					callTool,
					close,
				}),
				generateRecommendation: async ({ baselineContext, toolCall }) => {
					expect(baselineContext.case.id).toBe("runtime-case-1");
					expect(baselineContext.linkedFacts).toHaveLength(1);
					const relatedFacts = await toolCall("search_related_facts", {
						caseId: "runtime-case-1",
						limit: 5,
					});
					return {
						transcript: [
							{
								role: "assistant",
								content: "I found matching invoice evidence in the case history.",
							},
						],
						recommendation: {
							proposedAction: "close_case",
							confidence: 0.92,
							summary: "Invoice evidence supports closure.",
							evidenceFactIds: ["fact-1"],
						},
						debugBundle: relatedFacts,
					};
				},
			});

			const result = await runtime.run({
				caseId: "runtime-case-1",
				propertyId: "LIE-013",
				confidenceThreshold: 0.8,
			});

			expect(connect).toHaveBeenCalledOnce();
			expect(listTools).toHaveBeenCalledOnce();
			expect(callTool).toHaveBeenCalledWith({
				name: "search_related_facts",
				arguments: {
					caseId: "runtime-case-1",
					limit: 5,
				},
			});
			expect(result.recommendation.proposedAction).toBe("close_case");
			expect(result.guardrailResult?.closed).toBe(true);

			const storedRun = await db.query.agentRuns.findFirst({
				where: (agentRuns, { eq }) => eq(agentRuns.id, result.runId),
				with: {
					messages: true,
					toolCalls: true,
					guardrailTrace: true,
				},
			});
			expect(storedRun?.messages.some((message) => message.role === "assistant")).toBe(
				true,
			);
			expect(storedRun?.toolCalls[0]?.toolName).toBe("search_related_facts");
			expect(storedRun?.guardrailTrace?.decision).toBe("approved");
		} finally {
			await testDb.close();
		}
	});

	it("persists failed tool calls when the MCP client returns an error", async () => {
		const testDb = await seedRuntimeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				modelId: "google/gemini-2.5-flash",
				baseUrl: "http://localhost:3000",
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect: async () => {},
					listTools: async () => ({
						tools: [{ name: "get_case_context_bundle", description: "case context", inputSchema: {} }],
					}),
					callTool: async () => ({
						content: [{ type: "text", text: "tool failed" }],
						isError: true,
					}),
					close: async () => {},
				}),
				generateRecommendation: async ({ toolCall }) => {
					await toolCall("get_case_context_bundle", {
						caseId: "runtime-case-1",
						relatedCasesLimit: 5,
						relatedFactsLimit: 5,
					});
					return {
						transcript: [],
						recommendation: {
							proposedAction: "keep_open",
							confidence: 0.3,
							summary: "No reliable evidence available.",
							evidenceFactIds: [],
						},
					};
				},
			});

			await expect(
				runtime.run({
					caseId: "runtime-case-1",
					propertyId: "LIE-013",
					confidenceThreshold: 0.8,
				}),
			).rejects.toThrow("MCP tool call failed");

			const storedRun = await db.query.agentRuns.findFirst({
				where: (agentRuns, { eq }) => eq(agentRuns.caseId, "runtime-case-1"),
				with: {
					toolCalls: true,
				},
			});

			expect(storedRun?.status).toBe("failed");
			expect(storedRun?.toolCalls[0]?.status).toBe("failed");
		} finally {
			await testDb.close();
		}
	});

	it("uses AI SDK native structured tools over the MCP client with a 50-step cap by default", async () => {
		const testDb = await seedRuntimeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);
		const callTool = vi.fn(async () => ({
			content: [
				{
					type: "text",
					text: JSON.stringify({
						results: [{ id: "fact-1", key: "invoice_paid", value: "paid" }],
					}),
				},
			],
			isError: false,
		}));

		vi.mocked(generateText).mockImplementationOnce(async (args: never) => {
			const callArgs = args as {
				tools?: Record<string, { execute?: (input: Record<string, unknown>) => Promise<unknown> }>;
				stopWhen?: (input: { steps: unknown[] }) => boolean | Promise<boolean>;
			};
			expect(callArgs.tools?.search_related_facts?.execute).toEqual(expect.any(Function));
			expect(await callArgs.stopWhen?.({ steps: Array.from({ length: 49 }) })).toBe(false);
			expect(await callArgs.stopWhen?.({ steps: Array.from({ length: 50 }) })).toBe(true);

			await callArgs.tools?.search_related_facts?.execute?.({
				caseId: "runtime-case-1",
				limit: 5,
			});

			return {
				text: JSON.stringify({
					proposedAction: "keep_open",
					confidence: 0.66,
					summary: "The invoice evidence was reviewed through MCP tools.",
					evidenceFactIds: ["fact-1"],
				}),
				response: {
					messages: [
						{
							role: "assistant",
							content: [
								{
									type: "text",
									text: "The invoice evidence was reviewed through MCP tools.",
								},
							],
						},
					],
				},
				steps: [],
			} as never;
		});

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect: async () => {},
					listTools: async () => ({
						tools: [
							{
								name: "search_related_facts",
								description: "Search related facts",
								inputSchema: {
									type: "object",
									properties: {
										caseId: { type: "string" },
										limit: { type: "number" },
									},
									required: ["caseId"],
								},
							},
						],
					}),
					callTool,
					close: async () => {},
				}),
			});

			const result = await runtime.run({
				caseId: "runtime-case-1",
				propertyId: "LIE-013",
				confidenceThreshold: 0.8,
			});

			expect(result.recommendation.proposedAction).toBe("keep_open");
			expect(callTool).toHaveBeenCalledWith({
				name: "search_related_facts",
				arguments: {
					caseId: "runtime-case-1",
					limit: 5,
				},
			});
		} finally {
			await testDb.close();
		}
	});

	it("skips MCP connection and generateText when case status is already resolved", async () => {
		const testDb = await createPostgresTestDb();
		const db = testDb.db;
		await db.insert(schema.properties).values({
			id: "LIE-014",
			name: "Terminal Property",
		});
		await db.insert(schema.houses).values({
			id: "LIE-014-H1",
			propertyId: "LIE-014",
			name: "House 1",
		});
		await db.insert(schema.apartments).values({
			id: "LIE-014-H1-A1",
			houseId: "LIE-014-H1",
			name: "Apartment 1",
		});
		await db.insert(schema.users).values({
			id: "user-14",
			name: "Owner",
			email: "owner14@example.com",
		});
		await db.insert(schema.cases).values({
			id: "runtime-case-resolved",
			propertyId: "LIE-014",
			houseId: "LIE-014-H1",
			apartmentId: "LIE-014-H1-A1",
			ownerUserId: "user-14",
			caseKey: "a:LIE-014-H1-A1|test|resolved",
			closurePredicate: "invoice_paid",
			title: "Done case",
			summary: "Already closed.",
			status: "resolved",
			createdAt: "2026-04-26T09:00:00.000Z",
			updatedAt: "2026-04-26T09:00:00.000Z",
		});

		const connect = vi.fn();
		const lifecycle = new CaseLifecycleService(db);

		try {
			vi.mocked(generateText).mockClear();
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect,
					listTools: async () => ({ tools: [] }),
					callTool: async () => ({ isError: true, content: [] }),
					close: async () => {},
				}),
			});

			const result = await runtime.run({
				caseId: "runtime-case-resolved",
				propertyId: "LIE-014",
				confidenceThreshold: 0.8,
			});

			expect(connect).not.toHaveBeenCalled();
			expect(vi.mocked(generateText).mock.calls.length).toBe(0);
			expect(result.recommendation).toEqual({
				proposedAction: "close_case",
				confidence: 1,
				summary: "Case is already resolved.",
				evidenceFactIds: [],
			});
			expect(result.guardrailResult).toEqual({
				closed: false,
				reason: "already_terminal",
			});
			expect(result.debugBundle).toEqual({ skippedBecauseTerminal: true });
		} finally {
			await testDb.close();
		}
	});

	it("keeps investigating across multiple tool calls until a completion decision is reached", async () => {
		const testDb = await seedRuntimeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);
		const planner = vi
			.fn()
			.mockResolvedValueOnce({
				status: "continue",
				assistantMessage: "I’m checking scoped closure evidence first.",
				toolName: "get_case_closure_evidence",
				toolArguments: {
					caseId: "runtime-case-1",
					limit: 10,
				},
			})
			.mockResolvedValueOnce({
				status: "continue",
				assistantMessage: "Closure evidence was inconclusive, so I’m checking broader history.",
				toolName: "search_case_history",
				toolArguments: {
					caseId: "runtime-case-1",
					limit: 5,
				},
			})
			.mockResolvedValueOnce({
				status: "done",
				assistantMessage: "The history confirms the invoice was paid and the case can be closed.",
				recommendation: {
					proposedAction: "close_case",
					confidence: 0.93,
					summary: "Invoice payment evidence across the case and history supports closure.",
					evidenceFactIds: ["fact-1"],
				},
			});

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				modelId: "google/gemini-2.5-flash",
				baseUrl: "http://localhost:3000",
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect: async () => {},
					listTools: async () => ({
						tools: [
							{ name: "get_case_closure_evidence", description: "closure evidence", inputSchema: {} },
							{ name: "search_case_history", description: "case history", inputSchema: {} },
						],
					}),
					callTool: vi
						.fn()
						.mockResolvedValueOnce({
							content: [{ type: "text", text: JSON.stringify({ matchingFacts: [] }) }],
							isError: false,
						})
						.mockResolvedValueOnce({
							content: [
								{
									type: "text",
									text: JSON.stringify({
										relatedFacts: [{ id: "fact-1", key: "invoice_paid", value: "paid" }],
										relatedCases: [],
									}),
								},
							],
							isError: false,
						}),
					close: async () => {},
				}),
				planInvestigationStep: planner,
			});

			const result = await runtime.run({
				caseId: "runtime-case-1",
				propertyId: "LIE-013",
				confidenceThreshold: 0.8,
			});

			expect(planner).toHaveBeenCalledTimes(3);
			expect(result.recommendation.proposedAction).toBe("close_case");

			const storedRun = await db.query.agentRuns.findFirst({
				where: (agentRuns, { eq }) => eq(agentRuns.id, result.runId),
				with: {
					messages: true,
					toolCalls: true,
				},
			});
			expect(storedRun?.toolCalls.map((toolCall) => toolCall.toolName)).toEqual([
				"get_case_closure_evidence",
				"search_case_history",
			]);
			expect(
				storedRun?.messages.filter((message) => message.role === "assistant").map((message) => message.content),
			).toEqual([
				"I’m checking scoped closure evidence first.",
				"Closure evidence was inconclusive, so I’m checking broader history.",
				"The history confirms the invoice was paid and the case can be closed.",
			]);
		} finally {
			await testDb.close();
		}
	});

	it("forces a broader history check before accepting an early keep-open decision", async () => {
		const testDb = await seedRuntimeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);
		const planner = vi
			.fn()
			.mockResolvedValueOnce({
				status: "continue",
				assistantMessage: "I’m checking closure evidence first.",
				toolName: "get_case_closure_evidence",
				toolArguments: { caseId: "runtime-case-1", limit: 10 },
			})
			.mockResolvedValueOnce({
				status: "done",
				assistantMessage: "I don’t see enough closure evidence yet.",
				recommendation: {
					proposedAction: "keep_open",
					confidence: 0.55,
					summary: "No reliable closure evidence found yet.",
					evidenceFactIds: [],
				},
			})
			.mockResolvedValueOnce({
				status: "done",
				assistantMessage: "History was checked as well, so the case should remain open for now.",
				recommendation: {
					proposedAction: "keep_open",
					confidence: 0.62,
					summary: "Closure evidence is still insufficient after checking history.",
					evidenceFactIds: [],
				},
			});

		const callTool = vi
			.fn()
			.mockResolvedValueOnce({
				content: [{ type: "text", text: JSON.stringify({ matchingFacts: [] }) }],
				isError: false,
			})
			.mockResolvedValueOnce({
				content: [{ type: "text", text: JSON.stringify({ relatedFacts: [], relatedCases: [] }) }],
				isError: false,
			});

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect: async () => {},
					listTools: async () => ({
						tools: [
							{ name: "get_case_closure_evidence", description: "closure evidence", inputSchema: {} },
							{ name: "search_case_history", description: "history", inputSchema: {} },
						],
					}),
					callTool,
					close: async () => {},
				}),
				planInvestigationStep: planner,
			});

			const result = await runtime.run({
				caseId: "runtime-case-1",
				propertyId: "LIE-013",
				confidenceThreshold: 0.8,
			});

			expect(result.recommendation.proposedAction).toBe("keep_open");
			expect(callTool).toHaveBeenNthCalledWith(2, {
				name: "search_case_history",
				arguments: {
					caseId: "runtime-case-1",
					limit: 5,
				},
			});
		} finally {
			await testDb.close();
		}
	});

	it("forces testfiles research for payment disputes before accepting keep-open", async () => {
		const testDb = await seedPaymentDisputeCase();
		const db = testDb.db;
		const lifecycle = new CaseLifecycleService(db);
		const planner = vi
			.fn()
			.mockResolvedValueOnce({
				status: "continue",
				assistantMessage: "I’m checking closure evidence first.",
				toolName: "get_case_closure_evidence",
				toolArguments: { caseId: "runtime-case-99", limit: 10 },
			})
			.mockResolvedValueOnce({
				status: "done",
				assistantMessage: "I still do not see enough closure evidence.",
				recommendation: {
					proposedAction: "keep_open",
					confidence: 0.5,
					summary: "No reliable closure evidence found yet.",
					evidenceFactIds: [],
				},
			})
			.mockResolvedValueOnce({
				status: "done",
				assistantMessage: "The bank files were checked and the case should stay open until a matching payment is confirmed.",
				recommendation: {
					proposedAction: "keep_open",
					confidence: 0.65,
					summary: "No matching bank payment was confirmed after checking raw files.",
					evidenceFactIds: [],
				},
			});

		const callTool = vi
			.fn()
			.mockResolvedValueOnce({
				content: [{ type: "text", text: JSON.stringify({ matchingFacts: [] }) }],
				isError: false,
			})
			.mockResolvedValueOnce({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							root: "testfiles",
							relativePath: "bank/kontoauszug_2024_2025.csv",
							query: "Chantal Täsche",
							matches: [],
						}),
					},
				],
				isError: false,
			});

		try {
			const runtime = new CaseAgentRuntime(db, lifecycle, {
				now: () => "2026-04-26T10:00:00.000Z",
				createMcpClient: async () => ({
					connect: async () => {},
					listTools: async () => ({
						tools: [
							{ name: "get_case_closure_evidence", description: "closure evidence", inputSchema: {} },
							{ name: "grep_testfiles", description: "search raw files", inputSchema: {} },
						],
					}),
					callTool,
					close: async () => {},
				}),
				planInvestigationStep: planner,
			});

			const result = await runtime.run({
				caseId: "runtime-case-99",
				propertyId: "LIE-099",
				confidenceThreshold: 0.8,
			});

			expect(result.recommendation.proposedAction).toBe("keep_open");
			expect(callTool).toHaveBeenNthCalledWith(2, {
				name: "grep_testfiles",
				arguments: {
					relativePath: "bank/kontoauszug_2024_2025.csv",
					query: "Chantal Täsche",
					limit: 20,
				},
			});
		} finally {
			await testDb.close();
		}
	});
});
