import { describe, expect, it, vi } from "vitest";
import type { LlmJsonClient } from "../../types";
import { GeminiCaseExtractor } from "../CaseExtractor";

describe("GeminiCaseExtractor (R2.2)", () => {
	it("parses strict JSON from stubbed LLM client", async () => {
		const llm: LlmJsonClient = {
			generateJson: vi.fn().mockResolvedValue({
				cases: [
					{
						title: "Open incident",
						summary: "Elevator stuck between floors.",
						status: "open",
						scopeHint: "property",
						primarySignal: "ELEV-009",
						confidence: 0.91,
					},
				],
			}),
		};
		const extractor = new GeminiCaseExtractor(llm);
		const cases = await extractor.extract("Noise text", { propertyId: "LIE-001" });
		expect(cases).toHaveLength(1);
		expect(cases[0].primarySignal).toBe("ELEV-009");
	});

	it("returns empty list on invalid JSON envelope", async () => {
		const llm: LlmJsonClient = {
			generateJson: vi.fn().mockResolvedValue({ notCases: [] }),
		};
		const extractor = new GeminiCaseExtractor(llm);
		await expect(
			extractor.extract("x", { propertyId: "LIE-001" }),
		).resolves.toEqual([]);
	});

	it("tells the model to write descriptive case titles and action-oriented summaries", async () => {
		const llm: LlmJsonClient = {
			generateJson: vi.fn().mockResolvedValue({ cases: [] }),
		};
		const extractor = new GeminiCaseExtractor(llm);

		await extractor.extract("Invoice follow-up for window repair.", {
			propertyId: "LIE-001",
		});

		expect(llm.generateJson).toHaveBeenCalledTimes(1);
		const prompt = vi.mocked(llm.generateJson).mock.calls[0][0];
		expect(prompt).toContain('"title": "clear human case title"');
		expect(prompt).toContain(
			'"summary": "2-4 sentences describing what happened, current state, and next required action"',
		);
		expect(prompt).toContain(
			"The title must be specific and immediately understandable without opening the source document.",
		);
		expect(prompt).toContain(
			'Avoid vague titles such as "Follow-up", "Issue", "Open incident", or "Window repair batch".',
		);
		expect(prompt).toContain(
			'Prefer titles like "Tenant reports repeated elevator outage in house 3" or "Outstanding payment for window repair invoice INV-2048".',
		);
		expect(prompt).toContain(
			"The summary must clearly describe what happened, what has already been done, and what still needs to happen for the case to move forward or close.",
		);
		expect(prompt).toContain(
			"Preserve concrete details such as the affected unit, vendor, invoice id, amount, date, requester, and promised follow-up whenever the source provides them.",
		);
	});

	it("throws in strict mode when the client fails", async () => {
		const llm: LlmJsonClient = {
			generateJson: vi.fn().mockRejectedValue(new Error("quota")),
		};
		const extractor = new GeminiCaseExtractor(llm, { strictErrors: true });
		await expect(extractor.extract("x", { propertyId: "LIE-001" })).rejects.toThrow(
			/quota/,
		);
	});
});
