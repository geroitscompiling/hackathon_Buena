import { describe, expect, it, vi } from "vitest";

import type { CaseDetail } from "#/services/caseDetails";
import {
	getCaseDetailStreamVersion,
	watchCaseDetailUpdates,
} from "#/services/caseDetailStream";

function makeDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
	return {
		case: {
			id: "case-1",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
			ownerUserId: "user-1",
			caseKey: "case-key",
			closurePredicate: "invoice_paid",
			title: "Case title",
			summary: "Case summary",
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
		evidence: [],
		guardrailTraces: [],
		agentRuns: [],
		...overrides,
	};
}

describe("caseDetailStream", () => {
	it("changes version when agent run activity changes", () => {
		const detail = makeDetail();
		const version1 = getCaseDetailStreamVersion(detail);
		const version2 = getCaseDetailStreamVersion({
			...detail,
			agentRuns: [
				{
					id: "run-1",
					caseId: "case-1",
					model: "google/gemini-2.5-flash",
					status: "running",
					finalRecommendationJson: null,
					finalRecommendation: null,
					guardrailTraceId: null,
					guardrailTrace: null,
					startedAt: "2026-04-26T09:01:00.000Z",
					finishedAt: null,
					createdAt: "2026-04-26T09:01:00.000Z",
					messages: [],
					toolCalls: [],
				},
			],
		});

		expect(version2).not.toBe(version1);
	});

	it("emits initial and changed snapshots while watching the case detail", async () => {
		const initialDetail = makeDetail();
		const updatedDetail = makeDetail({
			agentRuns: [
				{
					id: "run-1",
					caseId: "case-1",
					model: "google/gemini-2.5-flash",
					status: "running",
					finalRecommendationJson: null,
					finalRecommendation: null,
					guardrailTraceId: null,
					guardrailTrace: null,
					startedAt: "2026-04-26T09:01:00.000Z",
					finishedAt: null,
					createdAt: "2026-04-26T09:01:00.000Z",
					messages: [
						{
							id: "msg-1",
							agentRunId: "run-1",
							stepIndex: 0,
							role: "assistant",
							content: "Investigating",
							createdAt: "2026-04-26T09:01:10.000Z",
						},
					],
					toolCalls: [],
				},
			],
		});

		const getDetail = vi
			.fn<() => Promise<CaseDetail>>()
			.mockResolvedValueOnce(initialDetail)
			.mockResolvedValueOnce(initialDetail)
			.mockResolvedValueOnce(updatedDetail);
		const abortController = new AbortController();
		let sleepCalls = 0;

		const iterator = watchCaseDetailUpdates({
			caseId: "case-1",
			signal: abortController.signal,
			pollIntervalMs: 1,
			maxDurationMs: 10,
			getDetail: async (_caseId) => getDetail(),
			sleep: async () => {
				sleepCalls += 1;
				if (sleepCalls >= 3) {
					abortController.abort();
				}
			},
			now: (() => {
				let tick = 0;
				return () => tick++;
			})(),
		});

		const received = [];
		for await (const item of iterator) {
			received.push(item);
		}

		expect(received).toHaveLength(2);
		expect(received[0]?.kind).toBe("initial");
		expect(received[1]?.kind).toBe("update");
		expect(received[1]?.detail.agentRuns[0]?.messages[0]?.content).toBe(
			"Investigating",
		);
	});
});
