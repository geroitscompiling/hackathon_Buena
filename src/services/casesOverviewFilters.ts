import { z } from "zod";

/** Filters for /cases URL, API, and overview RPC (no DB imports — safe on the client). */
export const casesOverviewFilterInputSchema = z.object({
	q: z.string().max(500).optional(),
	status: z.string().optional(),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
});

export type CasesOverviewFilters = z.infer<typeof casesOverviewFilterInputSchema>;

/** How many rows the /cases overview loads in one request. */
export const CASES_OVERVIEW_LOAD_LIMIT = 5_000;

export function normalizeCasesOverviewFilters(
	raw: CasesOverviewFilters,
): {
	apartmentId?: string;
	houseId?: string;
	propertyId?: string;
	q?: string;
	status?: string;
} {
	const q = raw.q?.trim();
	const status = raw.status?.trim();
	const propertyId = raw.propertyId?.trim();
	const houseId = raw.houseId?.trim();
	const apartmentId = raw.apartmentId?.trim();
	return {
		apartmentId: apartmentId || undefined,
		houseId: houseId || undefined,
		propertyId: propertyId || undefined,
		q: q || undefined,
		status: status || undefined,
	};
}
