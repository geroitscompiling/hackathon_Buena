import { z } from "zod";

export const FACT_CATEGORY_ALL = "all" as const;

export const factsPageSearchSchema = z.object({
	q: z.string().optional().default(""),
	category: z.string().optional(),
	goldStandard: z.enum(["all", "gold", "nonGold"]).optional().default("all"),
	propertyId: z.string().optional(),
	houseId: z.string().optional(),
	apartmentId: z.string().optional(),
});

export type FactsPageSearch = z.infer<typeof factsPageSearchSchema>;

export function buildFactsSearchFromFormFields(input: {
	q: string;
	category: string;
	goldStandard: string;
	propertyId: string;
	houseId: string;
	apartmentId: string;
}): FactsPageSearch {
	return factsPageSearchSchema.parse({
		apartmentId: input.apartmentId.trim() || undefined,
		category:
			input.category === FACT_CATEGORY_ALL || !input.category.trim() ?
				undefined
			:	input.category.trim(),
		goldStandard:
			input.goldStandard === "gold" || input.goldStandard === "nonGold" ?
				input.goldStandard
			:	"all",
		houseId: input.houseId.trim() || undefined,
		propertyId: input.propertyId.trim() || undefined,
		q: input.q.trim() || "",
	});
}
