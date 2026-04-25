import { describe, expect, it } from "vitest";
import type { CaseIntent } from "../caseDomain";
import { mergeCaseIntentsForSameKey, type ScopedCaseIntent } from "../caseIntentMerge";

describe("caseIntentMerge (R2.8)", () => {
	const scope = {
		scopeType: "house" as const,
		propertyId: "LIE-001",
		houseId: "LIE-001-H1",
	};

	function scoped(intent: CaseIntent, caseKey: string): ScopedCaseIntent {
		return { intent, scope, caseKey };
	}

	it("prefers higher confidence title and appends alt-title bullet to summary", () => {
		const a: CaseIntent = {
			title: "Short title",
			summary: "First summary",
			status: "open",
			scopeHint: "house",
			primarySignal: "SIG-1",
			confidence: 0.55,
		};
		const b: CaseIntent = {
			title: "Longer authoritative title",
			summary: "Second summary",
			status: "in_progress",
			scopeHint: "house",
			primarySignal: "SIG-1",
			closurePredicate: "repair_completed",
			confidence: 0.95,
		};
		const merged = mergeCaseIntentsForSameKey([
			scoped(a, "k1"),
			scoped(b, "k1"),
		]);
		expect(merged.title).toBe("Longer authoritative title");
		expect(merged.status).toBe("in_progress");
		expect(merged.closurePredicate).toBe("repair_completed");
		expect(merged.summary).toContain("• (alt title) Short title:");
	});

	it("keeps single intent unchanged", () => {
		const intent: CaseIntent = {
			title: "Only",
			summary: "S",
			status: "open",
			scopeHint: "property",
			primarySignal: "p1",
			confidence: 0.8,
		};
		expect(mergeCaseIntentsForSameKey([scoped(intent, "k")])).toEqual(intent);
	});
});
