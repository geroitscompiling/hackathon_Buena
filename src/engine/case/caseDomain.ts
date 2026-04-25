import { z } from "zod";

/** Terminal workflow state for auto-close (POC). */
export const TERMINAL_CASE_STATUS = "resolved" as const;

export const caseStatusSchema = z.enum([
	"open",
	"in_progress",
	"investigating",
	"blocked",
	"on_hold",
	"resolved",
]);

export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const caseClosurePredicateSchema = z.enum([
	"resolution_confirmed",
	"invoice_paid",
	"repair_completed",
]);

export type CaseClosurePredicate = z.infer<typeof caseClosurePredicateSchema>;

export const scopeHintSchema = z.enum(["property", "house", "apartment"]);

export type CaseScopeHint = z.infer<typeof scopeHintSchema>;

/**
 * Normalized case shape after validation (R2.0).
 * `caseKey` is the stable match key; it may be supplied by extractors but
 * the lifecycle service recomputes identity from scope + signals (R2.3).
 */
export const caseIntentSchema = z
	.object({
		title: z.string().min(1),
		summary: z.string(),
		status: caseStatusSchema,
		scopeHint: scopeHintSchema,
		primarySignal: z.string().min(1),
		closurePredicate: caseClosurePredicateSchema.optional(),
		confidence: z.number().min(0).max(1),
	})
	.strict();

export type CaseIntent = z.infer<typeof caseIntentSchema>;

/** Optional extractor hints; `caseKey` must not be trusted for identity (R2.3). */
export const rawCaseIntentSchema = z
	.object({
		caseKey: z.string().optional(),
		title: z.string().min(1),
		summary: z.string(),
		status: caseStatusSchema,
		scopeHint: scopeHintSchema,
		primarySignal: z.string().min(1),
		closurePredicate: caseClosurePredicateSchema.optional(),
		confidence: z.number().min(0).max(1),
	})
	.strict();

export type RawCaseIntent = z.infer<typeof rawCaseIntentSchema>;

export const caseUpsertCommandSchema = z
	.object({
		caseKey: z.string().min(1),
		title: z.string().min(1),
		summary: z.string(),
		status: caseStatusSchema,
		propertyId: z.string().min(1),
		houseId: z.string().optional(),
		apartmentId: z.string().optional(),
		ownerUserId: z.string().min(1),
		closurePredicate: caseClosurePredicateSchema.optional(),
	})
	.refine(
		(cmd) => {
			if (cmd.apartmentId && !cmd.houseId) return false;
			return true;
		},
		{ message: "apartment scope requires houseId" },
	);

export type CaseUpsertCommand = z.infer<typeof caseUpsertCommandSchema>;

export const caseExtractorResponseSchema = z
	.object({
		cases: z.array(rawCaseIntentSchema),
	})
	.strict();

export type CaseExtractorResponse = z.infer<typeof caseExtractorResponseSchema>;

export function parseCaseExtractorResponse(data: unknown): CaseIntent[] {
	const parsed = caseExtractorResponseSchema.safeParse(data);
	if (!parsed.success) {
		return [];
	}
	return parsed.data.cases.map((row) => caseIntentSchema.parse(row));
}
