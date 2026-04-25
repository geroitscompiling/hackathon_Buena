import { describe, expect, it } from "vitest";

import type { ExtractedFact } from "../../types";
import { HierarchyResolver } from "../HierarchyResolver";

type ResolverInput = {
	propertyId: string;
	documentMetadata?: {
		houseId?: string;
		apartmentId?: string;
		unitLabel?: string;
	};
	extractedFact: Pick<ExtractedFact, "key" | "value">;
};

type ResolvedScope = {
	scopeType: "property" | "house" | "apartment";
	propertyId: string;
	houseId?: string;
	apartmentId?: string;
};

const hierarchyFixture = {
	propertyId: "LIE-001",
	houses: [
		{
			id: "LIE-001-H1",
			apartments: [
				{ id: "LIE-001-H1-A1", name: "Unit 1" },
				{ id: "LIE-001-H1-A2", name: "Unit 2" },
			],
		},
		{
			id: "LIE-001-H2",
			apartments: [{ id: "LIE-001-H2-A1", name: "Atelier Loft" }],
		},
	],
} as const;

describe("HierarchyResolver", () => {
	it("returns property scope when only property-level signal is available", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-001",
			documentMetadata: {},
			extractedFact: { key: "insurance_policy", value: "renewal_pending" },
		};

		await expect(resolver.resolve(input)).resolves.toEqual<ResolvedScope>({
			scopeType: "property",
			propertyId: "LIE-001",
		});
	});

	it("returns house scope when a valid house-level signal is present", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-001",
			documentMetadata: { houseId: "LIE-001-H2" },
			extractedFact: { key: "boiler_status", value: "inspection_due" },
		};

		await expect(resolver.resolve(input)).resolves.toEqual<ResolvedScope>({
			scopeType: "house",
			propertyId: "LIE-001",
			houseId: "LIE-001-H2",
		});
	});

	it("returns apartment scope when a valid apartment-level signal is present", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-001",
			documentMetadata: { apartmentId: "LIE-001-H1-A2" },
			extractedFact: { key: "smoke_detector", value: "battery_low" },
		};

		await expect(resolver.resolve(input)).resolves.toEqual<ResolvedScope>({
			scopeType: "apartment",
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A2",
		});
	});

	it("falls back deterministically to property scope for ambiguous signals", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-001",
			documentMetadata: {
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H2-A1",
			},
			extractedFact: { key: "water_ingress", value: "reported_after_rain" },
		};

		await expect(resolver.resolve(input)).resolves.toEqual<ResolvedScope>({
			scopeType: "property",
			propertyId: "LIE-001",
		});
	});

	it("falls back to property scope for unknown unit references", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-001",
			documentMetadata: { apartmentId: "LIE-001-H9-A9", unitLabel: "Unit 999" },
			extractedFact: { key: "window_damage", value: "reported" },
		};

		await expect(resolver.resolve(input)).resolves.toEqual<ResolvedScope>({
			scopeType: "property",
			propertyId: "LIE-001",
		});
	});

	it("rejects missing property identifiers", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input = {
			propertyId: "",
			documentMetadata: { houseId: "LIE-001-H1" },
			extractedFact: { key: "heating", value: "offline" },
		} as ResolverInput;

		await expect(resolver.resolve(input)).rejects.toThrow(
			"HierarchyResolver requires a valid propertyId",
		);
	});

	it("rejects invalid property identifiers outside the hierarchy fixture", async () => {
		const resolver = new HierarchyResolver(hierarchyFixture);
		const input: ResolverInput = {
			propertyId: "LIE-999",
			documentMetadata: { houseId: "LIE-001-H1" },
			extractedFact: { key: "intercom", value: "not_working" },
		};

		await expect(resolver.resolve(input)).rejects.toThrow(
			"HierarchyResolver received an unknown propertyId",
		);
	});
});
