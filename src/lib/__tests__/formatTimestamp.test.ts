import { describe, expect, it } from "vitest";

import { formatMediumDateTime } from "#/lib/formatTimestamp";

describe("formatMediumDateTime", () => {
	it("formats a UTC instant deterministically", () => {
		expect(formatMediumDateTime("2026-04-26T09:49:00.000Z")).toBe(
			"26 Apr 2026, 09:49 UTC",
		);
	});

	it("returns the input when the date is invalid", () => {
		expect(formatMediumDateTime("not-a-date")).toBe("not-a-date");
	});
});
