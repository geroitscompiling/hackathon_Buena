// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	PropertyHierarchyList,
	type PropertyHierarchyListItem,
} from "#/components/PropertyHierarchyList";

describe("PropertyHierarchyList", () => {
	it("renders properties with nested houses and apartments", () => {
		const properties: PropertyHierarchyListItem[] = [
			{
				id: "LIE-001",
				name: "Immanuelkirchstrasse 26",
				houses: [
					{
						id: "LIE-001-H1",
						name: "Front House",
						propertyId: "LIE-001",
						apartments: [
							{
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

		expect(screen.getByText("Immanuelkirchstrasse 26")).toBeTruthy();
		expect(screen.getByText("Front House")).toBeTruthy();
		expect(screen.getByText("Unit 1")).toBeTruthy();
	});

	it("opens the create property dialog from the hierarchy UI", () => {
		render(<PropertyHierarchyList properties={[]} />);

		fireEvent.click(screen.getAllByRole("button", { name: "Add Property" })[0]);

		expect(screen.getAllByText("Create Property").length).toBeGreaterThan(0);
		expect(screen.getByLabelText("Property ID")).toBeTruthy();
		expect(screen.getByLabelText("Property Name")).toBeTruthy();
	});
});
