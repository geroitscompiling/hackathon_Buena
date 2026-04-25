import { describe, expect, it } from "vitest";
import {
	caseIntentSchema,
	parseCaseExtractorResponse,
	rawCaseIntentSchema,
} from "../caseDomain";

describe("caseDomain (R2.0)", () => {
	it("rejects malformed raw intents", () => {
		expect(rawCaseIntentSchema.safeParse({ title: "" }).success).toBe(false);
		expect(
			rawCaseIntentSchema.safeParse({
				title: "Ok",
				summary: "s",
				status: "bogus",
				scopeHint: "property",
				primarySignal: "sig",
				confidence: 0.5,
			}).success,
		).toBe(false);
	});

	it("accepts valid intents", () => {
		const row = {
			title: "Invoice dispute",
			summary: "Tenant challenges heating bill.",
			status: "open" as const,
			scopeHint: "apartment" as const,
			primarySignal: "INV-1001",
			closurePredicate: "invoice_paid" as const,
			confidence: 0.88,
		};
		expect(() => caseIntentSchema.parse(row)).not.toThrow();
	});

	it("parses strict extractor JSON into intents", () => {
		const intents = parseCaseExtractorResponse({
			cases: [
				{
					title: "Leak",
					summary: "Bathroom leak",
					status: "open",
					scopeHint: "house",
					primarySignal: "TICKET-7",
					confidence: 0.9,
				},
			],
		});
		expect(intents).toHaveLength(1);
		expect(intents[0].primarySignal).toBe("TICKET-7");
	});

	it("returns empty list when envelope is invalid", () => {
		expect(parseCaseExtractorResponse({ cases: "nope" })).toEqual([]);
		expect(parseCaseExtractorResponse(null)).toEqual([]);
	});
});
