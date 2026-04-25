// @vitest-environment jsdom

import type * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	PropertyHierarchyList,
	type PropertyHierarchyListItem,
} from "#/components/PropertyHierarchyList";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		to?: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

describe("PropertyHierarchyList", () => {
	it("renders properties with nested houses and apartments", () => {
		const properties: PropertyHierarchyListItem[] = [
			{
				facts: [
					{
						id: "fact-1",
						category: "core_erp",
						key: "baujahr",
						value: "1990",
						isGoldStandard: true,
						confidenceScore: 1,
						source: {
							id: "source-1",
							fileId: "stammdaten.json",
							fileType: "json",
						},
					},
				],
				id: "LIE-001",
				name: "Immanuelkirchstrasse 26",
				houses: [
					{
						facts: [
							{
								id: "fact-2",
								category: "maintenance",
								key: "boiler_status",
								value: "inspection_due",
								isGoldStandard: false,
								confidenceScore: 0.94,
								source: {
									id: "source-2",
									fileId: "LTR-0001.pdf",
									fileType: "pdf",
								},
							},
						],
						id: "LIE-001-H1",
						name: "Front House",
						propertyId: "LIE-001",
						apartments: [
							{
								facts: [
									{
										id: "fact-3",
										category: "safety",
										key: "smoke_detector_check",
										value: "overdue",
										isGoldStandard: false,
										confidenceScore: 0.9,
										source: {
											id: "source-3",
											fileId: "EMAIL-0007.eml",
											fileType: "eml",
										},
									},
								],
								id: "LIE-001-H1-A1",
								houseId: "LIE-001-H1",
								name: "Unit 1",
							},
						],
					},
				],
			},
		];

		render(<PropertyHierarchyList properties={properties} />);

		expect(
			screen.getByRole("link", { name: /Immanuelkirchstrasse 26/i }),
		).toBeTruthy();
		expect(screen.queryByText("Front House")).toBeNull();
		expect(screen.queryByText("baujahr")).toBeNull();

		fireEvent.click(
			screen.getByRole("button", { name: /Toggle Immanuelkirchstrasse 26/i }),
		);
		expect(
			screen.getByRole("link", { name: /Front House/i }),
		).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: /Toggle Front House/i }),
		);
		expect(screen.getByText("Front House")).toBeTruthy();
		expect(screen.getByText("Unit 1")).toBeTruthy();
		expect(screen.getByRole("link", { name: /Unit 1/i })).toBeTruthy();
		expect(screen.queryByText("boiler_status")).toBeNull();
		expect(screen.queryByText("smoke_detector_check")).toBeNull();
	});

	it("opens the create property dialog from the hierarchy UI", () => {
		render(<PropertyHierarchyList properties={[]} />);

		fireEvent.click(screen.getAllByRole("button", { name: "Add Property" })[0]);

		expect(screen.getAllByText("Create Property").length).toBeGreaterThan(0);
		expect(screen.getByLabelText("Property ID")).toBeTruthy();
		expect(screen.getByLabelText("Property Name")).toBeTruthy();
	});
});
