// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseDetailView } from "#/components/CaseDetailView";
import type { CaseDetail } from "#/services/caseDetails";

const sampleDetail = {
	case: {
		id: "case-1",
		propertyId: "LIE-001",
		houseId: "LIE-001-H1",
		apartmentId: "LIE-001-H1-A1",
		ownerUserId: "user-1",
		caseKey: "a:LIE-001-H1-A1|invoice|window-invoice",
		closurePredicate: "invoice_paid",
		title: "Window invoice follow-up",
		summary: "Waiting for invoice confirmation",
		status: "open",
		createdAt: "2026-04-26T09:00:00.000Z",
		updatedAt: "2026-04-26T09:00:00.000Z",
		embedding: null,
		property: {
			id: "LIE-001",
			name: "Property",
		},
		house: {
			id: "LIE-001-H1",
			propertyId: "LIE-001",
			name: "House 1",
		},
		apartment: {
			id: "LIE-001-H1-A1",
			houseId: "LIE-001-H1",
			name: "Apartment 1",
		},
		owner: {
			id: "user-1",
			name: "Owner",
			email: "owner@example.com",
		},
	},
	evidence: [
		{
			id: "fact-1",
			propertyId: "LIE-001",
			category: "financial",
			key: "invoice_paid",
			value: "paid",
			sourceId: "source-1",
			isGoldStandard: false,
			confidenceScore: 0.97,
			embedding: null,
			source: {
				id: "source-1",
				fileId: "EMAIL-1001.eml",
				fileType: "eml",
				ingestionDate: "2026-04-26T08:00:00.000Z",
				documentDate: "2026-04-25",
				anchorReference: null,
			},
		},
	],
	guardrailTraces: [
		{
			id: "trace-1",
			caseId: "case-1",
			action: "close_case",
			decision: "approved",
			reason: "closed_with_guardrails",
			confidenceScore: 0.91,
			confidenceThreshold: 0.8,
			evidenceFactIds: ["fact-1"],
			contextSummary: "Invoice evidence supports closure.",
			createdAt: "2026-04-26T10:00:00.000Z",
		},
	],
	agentRuns: [
		{
			id: "run-1",
			caseId: "case-1",
			model: "google/gemini-2.5-flash",
			status: "completed",
			finalRecommendationJson: JSON.stringify({
				proposedAction: "close_case",
				confidence: 0.91,
				summary: "Invoice evidence supports closure.",
				evidenceFactIds: ["fact-1"],
			}),
			finalRecommendation: {
				proposedAction: "close_case" as const,
				confidence: 0.91,
				summary: "Invoice evidence supports closure.",
				evidenceFactIds: ["fact-1"],
			},
			guardrailTraceId: "trace-1",
			startedAt: "2026-04-26T09:59:00.000Z",
			finishedAt: "2026-04-26T10:00:00.000Z",
			createdAt: "2026-04-26T09:59:00.000Z",
			guardrailTrace: null,
			messages: [
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
			],
			toolCalls: [
				{
					id: "tool-1",
					agentRunId: "run-1",
					stepIndex: 1,
					toolName: "get_case_context_bundle",
					argumentsJson: "{\"caseId\":\"case-1\"}",
					resultJson:
						"{\"case\":{\"id\":\"case-1\",\"embedding\":[0.1,0.2]},\"relatedFacts\":[{\"id\":\"fact-1\",\"vector\":[0.3,0.4]}]}",
					arguments: { caseId: "case-1" },
					result: {
						case: { id: "case-1", embedding: [0.1, 0.2] },
						relatedFacts: [{ id: "fact-1", vector: [0.3, 0.4] }],
					},
					status: "completed",
					error: null,
					startedAt: "2026-04-26T09:59:10.000Z",
					finishedAt: "2026-04-26T09:59:15.000Z",
					createdAt: "2026-04-26T09:59:10.000Z",
				},
			],
		},
	],
} satisfies CaseDetail;

describe("CaseDetailView", () => {
	it("renders core metadata, evidence, transcript, tool calls, and guardrails", () => {
		render(<CaseDetailView detail={sampleDetail} />);

		expect(screen.getByText("Waiting for invoice confirmation")).toBeTruthy();
		expect(screen.getByText("Linked facts with source traceability for this case.")).toBeTruthy();
		expect(screen.getByText("EMAIL-1001.eml")).toBeTruthy();
		expect(screen.getByText("Agent Activity")).toBeTruthy();
		expect(screen.getByText("I found invoice evidence and recommend closure.")).toBeTruthy();
		expect(
			screen.queryByText("Review the case and decide whether it should close."),
		).toBeNull();
		expect(screen.getByText("Get Case Context Bundle")).toBeTruthy();
		expect(
			screen.getByText("Loaded the case summary, related cases, and relevant evidence."),
		).toBeTruthy();
		expect(screen.getByText("Result")).toBeTruthy();
		expect(screen.queryByText(/embedding/)).toBeNull();
		expect(screen.queryByText(/vector/)).toBeNull();
		expect(screen.getByText("Guardrails")).toBeTruthy();
		expect(screen.getByText(/closed_with_guardrails/)).toBeTruthy();
	});

	it("renders empty states when no evidence or agent runs exist", () => {
		render(
			<CaseDetailView
				detail={{
					...sampleDetail,
					evidence: [],
					agentRuns: [],
					guardrailTraces: [],
				}}
			/>,
		);

		expect(screen.getByText("No linked evidence facts for this case yet.")).toBeTruthy();
		expect(
			screen.getByText("No AI SDK agent runs have been recorded for this case yet."),
		).toBeTruthy();
		expect(screen.getByText("No guardrail traces recorded for this case yet.")).toBeTruthy();
	});
});
