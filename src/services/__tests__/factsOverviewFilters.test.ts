import { describe, expect, it } from "vitest";

import { normalizeFactsOverviewFilters } from "#/services/factsOverviewFilters";

describe("normalizeFactsOverviewFilters", () => {
	it("trims strings and drops empties; defaults goldStandard to all", () => {
		expect(
			normalizeFactsOverviewFilters({
				apartmentId: "  ",
				category: " maintenance ",
				goldStandard: "",
				houseId: " H1 ",
				propertyId: "",
				q: "  leak  ",
			}),
		).toEqual({
			category: "maintenance",
			goldStandard: "all",
			houseId: "H1",
			q: "leak",
		});
	});

	it("preserves gold and nonGold", () => {
		expect(
			normalizeFactsOverviewFilters({ goldStandard: "gold" }),
		).toEqual({ goldStandard: "gold" });
		expect(
			normalizeFactsOverviewFilters({ goldStandard: "nonGold" }),
		).toEqual({ goldStandard: "nonGold" });
	});
});
