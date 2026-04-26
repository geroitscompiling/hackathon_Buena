import { describe, expect, it } from "vitest";

import * as schema from "#/db/schema";
import { createPostgresTestDb } from "#/test/postgresTestDb";
import { getCaseDetail } from "#/services/caseDetails";

async function seedCaseData() {
	const testDb = await createPostgresTestDb();
	const db = testDb.db;

	await db.insert(schema.properties).values({
		id: "LIE-011",
		name: "Case Detail Property",
	});
	await db.insert(schema.houses).values({
		id: "LIE-011-H1",
		propertyId: "LIE-011",
		name: "House 1",
	});
	await db.insert(schema.apartments).values({
		id: "LIE-011-H1-A1",
		houseId: "LIE-011-H1",
		name: "Apartment 1",
	});
	await db.insert(schema.users).values({
		id: "user-1",
		name: "Case Owner",
		email: "owner@example.com",
	});
	await db.insert(schema.sources).values({
		id: "source-1",
		fileId: "EMAIL-1001.eml",
		fileType: "eml",
		ingestionDate: "2026-04-26T08:00:00.000Z",
		documentDate: "2026-04-25",
	});
	await db.insert(schema.facts).values({
		id: "fact-1",
		propertyId: "LIE-011",
		category: "financial",
		key: "invoice_paid",
		value: "paid",
		sourceId: "source-1",
		isGoldStandard: false,
		confidenceScore: 0.97,
	});
	await db.insert(schema.cases).values({
		id: "case-detail-1",
		propertyId: "LIE-011",
		houseId: "LIE-011-H1",
		apartmentId: "LIE-011-H1-A1",
		ownerUserId: "user-1",
		caseKey: "a:LIE-011-H1-A1|invoice|window-invoice",
		closurePredicate: "invoice_paid",
		title: "Window invoice follow-up",
		summary: "Waiting for invoice confirmation",
		status: "open",
		createdAt: "2026-04-26T09:00:00.000Z",
		updatedAt: "2026-04-26T09:00:00.000Z",
	});
	await db.insert(schema.factHouses).values({
		factId: "fact-1",
		houseId: "LIE-011-H1",
	});
	await db.insert(schema.factApartments).values({
		factId: "fact-1",
		apartmentId: "LIE-011-H1-A1",
	});
	await db.insert(schema.factCases).values({
		factId: "fact-1",
		caseId: "case-detail-1",
	});
	await db.insert(schema.caseActionTraces).values({
		id: "trace-1",
		caseId: "case-detail-1",
		action: "close_case",
		decision: "approved",
		reason: "closed_with_guardrails",
		confidenceScore: 0.91,
		confidenceThreshold: 0.8,
		evidenceFactIds: JSON.stringify(["fact-1"]),
		contextSummary: "Invoice evidence supports closure.",
		createdAt: "2026-04-26T10:00:00.000Z",
	});
	await db.insert(schema.agentRuns).values({
		id: "run-1",
		caseId: "case-detail-1",
		model: "google/gemini-2.5-flash",
		status: "completed",
		finalRecommendationJson: JSON.stringify({
			proposedAction: "close_case",
			confidence: 0.91,
			summary: "Invoice evidence supports closure.",
			evidenceFactIds: ["fact-1"],
		}),
		guardrailTraceId: "trace-1",
		startedAt: "2026-04-26T09:59:00.000Z",
		finishedAt: "2026-04-26T10:00:00.000Z",
		createdAt: "2026-04-26T09:59:00.000Z",
	});
	await db.insert(schema.agentRunMessages).values([
		{
			id: "msg-1",
			agentRunId: "run-1",
			stepIndex: 0,
			role: "user",
			content: "Review the case and decide whether it should close.",
			createdAt: "2026-04-26T09:59:00.000Z",
		},
		{
			id: "msg-2",
			agentRunId: "run-1",
			stepIndex: 1,
			role: "assistant",
			content: "I found invoice evidence and recommend closure.",
			createdAt: "2026-04-26T09:59:30.000Z",
		},
	]);
	await db.insert(schema.agentRunToolCalls).values({
		id: "tool-1",
		agentRunId: "run-1",
		stepIndex: 1,
		toolName: "get_case_context_bundle",
		argumentsJson: JSON.stringify({
			caseId: "case-detail-1",
			relatedCasesLimit: 5,
			relatedFactsLimit: 5,
		}),
		resultJson: JSON.stringify({
			case: { id: "case-detail-1" },
			relatedFacts: [{ id: "fact-1" }],
		}),
		status: "completed",
		startedAt: "2026-04-26T09:59:10.000Z",
		finishedAt: "2026-04-26T09:59:15.000Z",
		createdAt: "2026-04-26T09:59:10.000Z",
	});

	return testDb;
}

describe("getCaseDetail", () => {
	it("returns nested case, evidence, runs, transcript, tool calls, and traces", async () => {
		const testDb = await seedCaseData();
		try {
			const detail = await getCaseDetail(testDb.db, "case-detail-1");

			expect(detail.case.id).toBe("case-detail-1");
			expect(detail.evidence).toHaveLength(1);
			expect(detail.evidence[0]?.source.fileId).toBe("EMAIL-1001.eml");
			expect(detail.agentRuns).toHaveLength(1);
			expect(detail.agentRuns[0]?.messages[1]?.role).toBe("assistant");
			expect(detail.agentRuns[0]?.toolCalls[0]?.toolName).toBe(
				"get_case_context_bundle",
			);
			expect(detail.guardrailTraces[0]?.reason).toBe("closed_with_guardrails");
		} finally {
			await testDb.close();
		}
	});

	it("returns an empty agent run list for legacy cases with no transcript data", async () => {
		const testDb = await createPostgresTestDb();
		const db = testDb.db;
		try {
			await db.insert(schema.properties).values({
				id: "LIE-012",
				name: "Legacy Property",
			});
			await db.insert(schema.users).values({
				id: "user-1",
				name: "Owner",
				email: "owner@example.com",
			});
			await db.insert(schema.cases).values({
				id: "legacy-case-1",
				propertyId: "LIE-012",
				houseId: null,
				apartmentId: null,
				ownerUserId: "user-1",
				caseKey: "p:LIE-012|signal|legacy-case",
				closurePredicate: null,
				title: "Legacy case",
				summary: "No run data yet",
				status: "open",
				createdAt: "2026-04-26T09:00:00.000Z",
				updatedAt: "2026-04-26T09:00:00.000Z",
			});

			const detail = await getCaseDetail(db, "legacy-case-1");

			expect(detail.case.id).toBe("legacy-case-1");
			expect(detail.agentRuns).toEqual([]);
			expect(detail.guardrailTraces).toEqual([]);
		} finally {
			await testDb.close();
		}
	});
});
