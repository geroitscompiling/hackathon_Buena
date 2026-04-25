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
