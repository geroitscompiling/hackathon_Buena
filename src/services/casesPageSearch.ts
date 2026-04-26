import { z } from "zod";

export const CASE_STATUS_ALL = "all" as const;

export const casesPageSearchSchema = z.object({
	q: z.string().optional().default(""),
	status: z.string().optional(),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
});

export type CasesPageSearch = z.infer<typeof casesPageSearchSchema>;

export function buildCasesSearchFromFormFields(input: {
	q: string;
	status: string;
	propertyId: string;
	houseId: string;
	apartmentId: string;
}): CasesPageSearch {
	return casesPageSearchSchema.parse({
		apartmentId: input.apartmentId.trim() || undefined,
		houseId: input.houseId.trim() || undefined,
		propertyId: input.propertyId.trim() || undefined,
		q: input.q.trim() || "",
		status:
			input.status === CASE_STATUS_ALL || !input.status.trim()
				? undefined
				: input.status.trim(),
	});
}
