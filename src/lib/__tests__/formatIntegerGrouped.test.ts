import { describe, expect, it } from "vitest";

import { formatIntegerGrouped } from "../utils";

describe("formatIntegerGrouped", () => {
	it("uses ASCII commas (SSR-safe, no locale)", () => {
		expect(formatIntegerGrouped(10000)).toBe("10,000");
		expect(formatIntegerGrouped(1536)).toBe("1,536");
		expect(formatIntegerGrouped(0)).toBe("0");
	});

	it("handles negatives", () => {
		expect(formatIntegerGrouped(-1200)).toBe("-1,200");
	});
});
