import { describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import {
	appendAgentRunMessage,
	appendAgentRunToolCall,
	completeAgentRun,
	createAgentRun,
} from "#/services/agentRuns";

async function seedCase() {
	const testDb = await createPostgresTestDb();
	const db = testDb.db;
	await db.insert(schema.properties).values({
		id: "LIE-010",
		name: "Telemetry Property",
	});
	await db.insert(schema.houses).values({
		id: "LIE-010-H1",
		propertyId: "LIE-010",
		name: "House 1",
	});
	await db.insert(schema.apartments).values({
		id: "LIE-010-H1-A1",
		houseId: "LIE-010-H1",
		name: "Apartment 1",
	});
	await db.insert(schema.users).values({
		id: "user-1",
		name: "Case Owner",
		email: "owner@example.com",
	});
	await db.insert(schema.cases).values({
		id: "case-telemetry-10",
		propertyId: "LIE-010",
		houseId: "LIE-010-H1",
		apartmentId: "LIE-010-H1-A1",
		ownerUserId: "user-1",
		caseKey: "a:LIE-010-H1-A1|invoice|window-invoice",
		closurePredicate: "invoice_paid",
		title: "Window invoice",
		summary: "Need invoice evidence",
		status: "open",
		createdAt: "2026-04-26T10:00:00.000Z",
		updatedAt: "2026-04-26T10:00:00.000Z",
	});
	return testDb;
}

describe("agentRuns service", () => {
	it("creates a run, appends ordered messages/tool calls, and completes it", async () => {
		const testDb = await seedCase();
		const db = testDb.db;

		try {
			const run = await createAgentRun(db, {
				caseId: "case-telemetry-10",
				model: "google/gemini-2.5-flash",
				startedAt: "2026-04-26T11:00:00.000Z",
			});

			await appendAgentRunMessage(db, {
				agentRunId: run.id,
				stepIndex: 0,
				role: "user",
				content: "Review this case.",
				createdAt: "2026-04-26T11:00:00.000Z",
			});
			await appendAgentRunMessage(db, {
				agentRunId: run.id,
				stepIndex: 1,
				role: "assistant",
				content: "I will inspect the available context.",
				createdAt: "2026-04-26T11:00:01.000Z",
			});

			await appendAgentRunToolCall(db, {
				agentRunId: run.id,
				stepIndex: 1,
				toolName: "get_case_context_bundle",
				arguments: {
					caseId: "case-telemetry-10",
					relatedCasesLimit: 5,
					relatedFactsLimit: 5,
				},
				result: {
					case: { id: "case-telemetry-10" },
					relatedFacts: [{ id: "fact-1" }],
				},
				status: "completed",
				startedAt: "2026-04-26T11:00:02.000Z",
				finishedAt: "2026-04-26T11:00:03.000Z",
				createdAt: "2026-04-26T11:00:02.000Z",
			});

			await completeAgentRun(db, {
				agentRunId: run.id,
				status: "completed",
				finalRecommendation: {
					proposedAction: "close_case",
					confidence: 0.91,
					summary: "Invoice evidence supports closure.",
					evidenceFactIds: ["fact-1"],
				},
				finishedAt: "2026-04-26T11:00:04.000Z",
			});

			const storedRun = await db.query.agentRuns.findFirst({
				where: (agentRuns, { eq }) => eq(agentRuns.id, run.id),
				with: {
					messages: true,
					toolCalls: true,
				},
			});

			expect(storedRun?.status).toBe("completed");
			expect(storedRun?.messages.map((message) => message.role)).toEqual([
				"user",
				"assistant",
			]);
			expect(storedRun?.toolCalls[0]?.toolName).toBe("get_case_context_bundle");
			expect(storedRun?.finalRecommendationJson).toContain("close_case");
		} finally {
			await testDb.close();
		}
	});
});
