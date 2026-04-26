import { z } from "zod";

/**
 * Filters for `/facts` URL, API, and overview RPC (no DB imports — safe on the client).
 * Mirrors {@link casesOverviewFilterInputSchema} / {@link normalizeCasesOverviewFilters}.
 */
export const factsOverviewFilterInputSchema = z.object({
	q: z.string().max(500).optional(),
	category: z.string().optional(),
	goldStandard: z.string().optional(),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
});

export type FactsOverviewFilters = z.infer<typeof factsOverviewFilterInputSchema>;

export function normalizeFactsOverviewFilters(raw: FactsOverviewFilters): {
	apartmentId?: string;
	category?: string;
	goldStandard: "all" | "gold" | "nonGold";
	houseId?: string;
	propertyId?: string;
	q?: string;
} {
	const q = raw.q?.trim();
	const category = raw.category?.trim();
	const propertyId = raw.propertyId?.trim();
	const houseId = raw.houseId?.trim();
	const apartmentId = raw.apartmentId?.trim();
	const gs = raw.goldStandard?.trim();
	const goldStandard =
		gs === "gold" || gs === "nonGold" ? gs : "all";

	return {
		apartmentId: apartmentId || undefined,
		category: category || undefined,
		goldStandard,
		houseId: houseId || undefined,
		propertyId: propertyId || undefined,
		q: q || undefined,
	};
}
