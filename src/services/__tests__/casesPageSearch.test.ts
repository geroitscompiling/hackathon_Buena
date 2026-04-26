import { describe, expect, it } from "vitest";

import {
	CASE_STATUS_ALL,
	buildCasesSearchFromFormFields,
	casesPageSearchSchema,
} from "../casesPageSearch";

describe("casesPageSearch", () => {
	it("preserves a concrete status in validated search (regression: URL must not drop status)", () => {
		const search = buildCasesSearchFromFormFields({
			apartmentId: "",
			houseId: "",
			propertyId: "",
			q: "",
			status: "open",
		});
		expect(search.status).toBe("open");
		expect(casesPageSearchSchema.parse(search).status).toBe("open");
	});

	it("clears status when filter is 'all'", () => {
		const search = buildCasesSearchFromFormFields({
			apartmentId: "",
			houseId: "",
			propertyId: "",
			q: "",
			status: CASE_STATUS_ALL,
		});
		expect(search.status).toBeUndefined();
	});
});
