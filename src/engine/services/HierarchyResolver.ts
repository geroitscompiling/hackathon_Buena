export type HierarchyNode = {
	id: string;
	apartments: Array<{
		id: string;
		name?: string;
	}>;
};

export type PropertyHierarchy = {
	propertyId: string;
	houses: HierarchyNode[];
};

export type HierarchyResolverInput = {
	propertyId: string;
	documentMetadata?: {
		houseId?: string;
		apartmentId?: string;
		unitLabel?: string;
	};
	extractedFact: {
		key: string;
		value: string | number | boolean;
	};
};

export type ResolvedHierarchyScope = {
	scopeType: "property" | "house" | "apartment";
	propertyId: string;
	houseId?: string;
	apartmentId?: string;
};

export class HierarchyResolver {
	constructor(private readonly hierarchy: PropertyHierarchy) {}

	async resolve(input: HierarchyResolverInput): Promise<ResolvedHierarchyScope> {
		const propertyId = input.propertyId.trim();
		if (!propertyId) {
			throw new Error("HierarchyResolver requires a valid propertyId");
		}

		if (propertyId !== this.hierarchy.propertyId) {
			throw new Error("HierarchyResolver received an unknown propertyId");
		}

		const apartmentSignal = input.documentMetadata?.apartmentId?.trim();
		const houseSignal = input.documentMetadata?.houseId?.trim();
		const normalizedUnitLabel = this.normalizeUnitLabel(
			input.documentMetadata?.unitLabel,
		);

		const apartmentMatch = apartmentSignal
			? this.findApartmentById(apartmentSignal)
			: normalizedUnitLabel
				? this.findApartmentByLabel(normalizedUnitLabel)
				: null;

		const houseMatch = houseSignal ? this.findHouseById(houseSignal) : null;

		// Deterministic ambiguity handling: if signals disagree, degrade to property.
		if (
			apartmentMatch &&
			houseMatch &&
			apartmentMatch.houseId !== houseMatch.id
		) {
			return {
				scopeType: "property",
				propertyId,
			};
		}

		if (apartmentMatch) {
			return {
				scopeType: "apartment",
				propertyId,
				houseId: apartmentMatch.houseId,
				apartmentId: apartmentMatch.id,
			};
		}

		if (houseMatch) {
			return {
				scopeType: "house",
				propertyId,
				houseId: houseMatch.id,
			};
		}

		return {
			scopeType: "property",
			propertyId,
		};
	}

	private findHouseById(houseId: string): HierarchyNode | null {
		return this.hierarchy.houses.find((house) => house.id === houseId) ?? null;
	}

	private findApartmentById(apartmentId: string): {
		id: string;
		houseId: string;
	} | null {
		for (const house of this.hierarchy.houses) {
			const apartment = house.apartments.find((node) => node.id === apartmentId);
			if (apartment) {
				return {
					id: apartment.id,
					houseId: house.id,
				};
			}
		}
		return null;
	}

	private findApartmentByLabel(normalizedLabel: string): {
		id: string;
		houseId: string;
	} | null {
		for (const house of this.hierarchy.houses) {
			for (const apartment of house.apartments) {
				if (!apartment.name) {
					continue;
				}
				if (this.normalizeUnitLabel(apartment.name) === normalizedLabel) {
					return {
						id: apartment.id,
						houseId: house.id,
					};
				}
			}
		}
		return null;
	}

	private normalizeUnitLabel(label: string | undefined): string {
		return (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
	}
}
