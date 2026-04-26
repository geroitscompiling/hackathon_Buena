import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schemaModule from "../schema";
import {
	agentRunMessages,
	agentRuns,
	agentRunToolCalls,
	apartments,
	cases,
	factApartments,
	factCases,
	factHouses,
	facts,
	houses,
	properties,
	sources,
	users,
} from "../schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";

describe("Database Schema", () => {
	let testDb: Awaited<ReturnType<typeof createPostgresTestDb>>;
	let db: Awaited<ReturnType<typeof createPostgresTestDb>>["db"];

	beforeAll(async () => {
		testDb = await createPostgresTestDb();
		db = testDb.db;
	});

	afterAll(async () => {
		await testDb?.close();
	});

	it("should not expose the removed todos table", () => {
		expect("todos" in schemaModule).toBe(false);
	});

	it("should insert and retrieve a source and a fact", async () => {
		await db.insert(properties).values({
			id: "LIE-001",
			name: "Immanuelkirchstrasse 26",
		});
		await db.insert(sources).values({
			id: "source-123",
			fileId: "stammdaten.json",
			fileType: "json",
			ingestionDate: new Date().toISOString(),
		});
		await db.insert(facts).values({
			id: "fact-123",
			propertyId: "LIE-001",
			category: "core_erp",
			key: "baujahr",
			value: "1990",
			sourceId: "source-123",
			isGoldStandard: true,
			confidenceScore: 1,
		});

		const retrievedFacts = await db.select().from(facts).where(eq(facts.id, "fact-123"));
		expect(retrievedFacts).toHaveLength(1);
		expect(retrievedFacts[0].propertyId).toBe("LIE-001");
		expect(retrievedFacts[0].isGoldStandard).toBe(true);

		const retrievedSources = await db
			.select()
			.from(sources)
			.where(eq(sources.id, retrievedFacts[0].sourceId));
		expect(retrievedSources).toHaveLength(1);
		expect(retrievedSources[0].fileId).toBe("stammdaten.json");
	});

	it("should resolve hierarchical and case relations without changing fact fields", async () => {
		await db.insert(properties).values({
			id: "LIE-002",
			name: "Example Property",
		});
		await db.insert(houses).values({
			id: "LIE-002-H1",
			propertyId: "LIE-002",
			name: "House 1",
		});
		await db.insert(apartments).values({
			id: "LIE-002-H1-A1",
			houseId: "LIE-002-H1",
			name: "Apartment 1",
		});
		await db.insert(users).values({
			id: "user-1",
			name: "Case Owner",
			email: "owner@example.com",
		});
		await db.insert(sources).values({
			id: "source-456",
			fileId: "EMAIL-001.eml",
			fileType: "eml",
			ingestionDate: new Date().toISOString(),
		});
		await db.insert(facts).values({
			id: "fact-456",
			propertyId: "LIE-002",
			category: "maintenance",
			key: "leak_detected",
			value: "true",
			sourceId: "source-456",
			isGoldStandard: false,
			confidenceScore: 0.98,
		});
		await db.insert(cases).values({
			id: "case-456",
			propertyId: "LIE-002",
			houseId: "LIE-002-H1",
			apartmentId: "LIE-002-H1-A1",
			ownerUserId: "user-1",
			caseKey: "test-a-leak|leak|water-leak-in-apartment",
			closurePredicate: null,
			title: "Water leak in apartment",
			summary: "Leak reported under kitchen sink",
			status: "open",
			createdAt: "2026-04-25T10:00:00.000Z",
			updatedAt: "2026-04-25T10:00:00.000Z",
		});
		await db.insert(factHouses).values({
			factId: "fact-456",
			houseId: "LIE-002-H1",
		});
		await db.insert(factApartments).values({
			factId: "fact-456",
			apartmentId: "LIE-002-H1-A1",
		});
		await db.insert(factCases).values({
			factId: "fact-456",
			caseId: "case-456",
		});

		const retrievedFact = await db.query.facts.findFirst({
			where: eq(facts.id, "fact-456"),
			with: {
				property: true,
				source: true,
				houseLinks: { with: { house: true } },
				apartmentLinks: { with: { apartment: true } },
				caseLinks: {
					with: {
						case: {
							with: {
								owner: true,
								property: true,
								house: true,
								apartment: true,
							},
						},
					},
				},
			},
		});

		expect(retrievedFact?.property.id).toBe("LIE-002");
		expect(retrievedFact?.source.fileId).toBe("EMAIL-001.eml");
		expect(retrievedFact?.houseLinks[0].house.id).toBe("LIE-002-H1");
		expect(retrievedFact?.apartmentLinks[0].apartment.id).toBe("LIE-002-H1-A1");
		expect(retrievedFact?.caseLinks[0].case.owner.name).toBe("Case Owner");
	});

	it("should persist agent runs with transcript messages and tool calls", async () => {
		await db.insert(properties).values({
			id: "LIE-003",
			name: "Agent Property",
		});
		await db.insert(houses).values({
			id: "LIE-003-H1",
			propertyId: "LIE-003",
			name: "House 1",
		});
		await db.insert(apartments).values({
			id: "LIE-003-H1-A1",
			houseId: "LIE-003-H1",
			name: "Apartment 1",
		});
		await db.insert(users).values({
			id: "user-2",
			name: "Agent Owner",
			email: "agent.owner@example.com",
		});
		await db.insert(cases).values({
			id: "case-telemetry-1",
			propertyId: "LIE-003",
			houseId: "LIE-003-H1",
			apartmentId: "LIE-003-H1-A1",
			ownerUserId: "user-2",
			caseKey: "a:LIE-003-H1-A1|window|window-repair-follow-up",
			closurePredicate: "invoice_paid",
			title: "Window repair follow-up",
			summary: "Waiting for invoice confirmation",
			status: "open",
			createdAt: "2026-04-26T10:00:00.000Z",
			updatedAt: "2026-04-26T10:00:00.000Z",
		});

		await db.insert(agentRuns).values({
			id: "run-1",
			caseId: "case-telemetry-1",
			model: "google/gemini-2.5-flash",
			status: "completed",
			finalRecommendationJson: JSON.stringify({
				proposedAction: "close_case",
				confidence: 0.91,
				summary: "Invoice evidence supports closure.",
				evidenceFactIds: ["fact-telemetry-1"],
			}),
			startedAt: "2026-04-26T11:00:00.000Z",
			finishedAt: "2026-04-26T11:00:05.000Z",
			createdAt: "2026-04-26T11:00:00.000Z",
		});
		await db.insert(agentRunMessages).values([
			{
				id: "msg-1",
				agentRunId: "run-1",
				stepIndex: 0,
				role: "user",
				content: "Inspect this case and decide whether it should close.",
				createdAt: "2026-04-26T11:00:00.000Z",
			},
			{
				id: "msg-2",
				agentRunId: "run-1",
				stepIndex: 1,
				role: "assistant",
				content: "I will inspect the case context and related evidence.",
				createdAt: "2026-04-26T11:00:01.000Z",
			},
		]);
		await db.insert(agentRunToolCalls).values({
			id: "tool-1",
			agentRunId: "run-1",
			stepIndex: 1,
			toolName: "get_case_context_bundle",
			argumentsJson: JSON.stringify({
				caseId: "case-telemetry-1",
				relatedCasesLimit: 5,
				relatedFactsLimit: 5,
			}),
			resultJson: JSON.stringify({
				case: { id: "case-telemetry-1" },
				relatedFacts: [{ id: "fact-telemetry-1" }],
			}),
			status: "completed",
			startedAt: "2026-04-26T11:00:02.000Z",
			finishedAt: "2026-04-26T11:00:03.000Z",
			createdAt: "2026-04-26T11:00:02.000Z",
		});

		const retrievedCase = await db.query.cases.findFirst({
			where: eq(cases.id, "case-telemetry-1"),
			with: {
				agentRuns: {
					with: {
						messages: true,
						toolCalls: true,
					},
				},
			},
		});

		expect(retrievedCase?.agentRuns).toHaveLength(1);
		expect(retrievedCase?.agentRuns[0].messages).toHaveLength(2);
		expect(retrievedCase?.agentRuns[0].toolCalls[0]?.toolName).toBe(
			"get_case_context_bundle",
		);
	});
});
