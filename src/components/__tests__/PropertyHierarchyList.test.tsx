import { renderToStaticMarkup } from "react-dom/server";
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

		const markup = renderToStaticMarkup(
			<PropertyHierarchyList properties={properties} />,
		);

		expect(markup).toContain("Immanuelkirchstrasse 26");
		expect(markup).toContain("Front House");
		expect(markup).toContain("Unit 1");
	});
});
