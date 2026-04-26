// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FactsTable } from "#/components/FactsTable";

describe("FactsTable", () => {
	it("renders facts in a table with property, source, and meta", () => {
		render(
			<FactsTable
				facts={[
					{
						apartmentIds: ["LIE-001-H1-A2"],
						caseIds: ["case-1"],
						category: "maintenance",
						confidenceScore: 0.94,
						houseIds: ["LIE-001-H1"],
						id: "fact-2",
						isGoldStandard: false,
						validFrom: "2026-04-01",
						key: "boiler_status",
						property: {
							id: "LIE-001",
							name: "Immanuelkirchstrasse 26",
						},
						source: {
							fileId: "LTR-0001.pdf",
							fileType: "pdf",
							id: "source-2",
						},
						value: "inspection_due",
					},
				]}
			/>,
		);

		expect(screen.getByRole("table")).toBeTruthy();
		expect(screen.getByText("boiler_status")).toBeTruthy();
		expect(screen.getByText("inspection_due")).toBeTruthy();
		expect(screen.getByText("Immanuelkirchstrasse 26")).toBeTruthy();
		expect(screen.queryByText("LIE-001-H1")).toBeNull();
		expect(screen.getByText("LTR-0001.pdf")).toBeTruthy();
		expect(screen.getByText("2026-04-01")).toBeTruthy();
	});

	it("renders an empty state when no facts are available", () => {
		render(<FactsTable facts={[]} />);

		expect(screen.getByText("No facts found.")).toBeTruthy();
	});
});
