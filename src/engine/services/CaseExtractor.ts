import type { CaseIntent } from "../case/caseDomain";
import { parseCaseExtractorResponse } from "../case/caseDomain";
import type { LlmJsonClient } from "../types";

export interface CaseExtractionContext {
	propertyId: string;
}

export interface CaseDocumentExtractor {
	extract(documentText: string, context: CaseExtractionContext): Promise<CaseIntent[]>;
}

interface CaseExtractorOptions {
	strictErrors?: boolean;
}

export class GeminiCaseExtractor implements CaseDocumentExtractor {
	constructor(
		private readonly llmClient: LlmJsonClient,
		private readonly options: CaseExtractorOptions = {},
	) {}

	async extract(
		documentText: string,
		_context: CaseExtractionContext,
	): Promise<CaseIntent[]> {
		const prompt = `
You are a case tracker for property management. Extract 0..N operational cases from the document.
Return valid JSON only using this shape:
{
  "cases": [
    {
      "title": "clear human case title",
      "summary": "2-4 sentences describing what happened, current state, and next required action",
      "status": "open" | "in_progress" | "investigating" | "blocked" | "on_hold" | "resolved",
      "scopeHint": "property" | "house" | "apartment",
      "primarySignal": "stable token such as invoice id, ticket id, or normalized subject stem",
      "closurePredicate": "resolution_confirmed" | "invoice_paid" | "repair_completed" | null,
      "confidence": 0.0
    }
  ]
}

Rules:
- If there is no actionable workflow, return {"cases":[]}.
- Write title and summary in English. If the document is not in English, translate while preserving proper names, identifiers, amounts, dates, and unit labels from the source.
- The title must be specific and immediately understandable without opening the source document.
- Avoid vague titles such as "Follow-up", "Issue", "Open incident", or "Window repair batch".
- Prefer titles like "Tenant reports repeated elevator outage in house 3" or "Outstanding payment for window repair invoice INV-2048".
- The title should identify the concrete subject of the case, what kind of problem or workflow it is, and the strongest available anchor such as the unit, vendor, invoice, repair, or complaint topic.
- The summary must clearly describe what happened, what has already been done, and what still needs to happen for the case to move forward or close.
- Preserve concrete details such as the affected unit, vendor, invoice id, amount, date, requester, and promised follow-up whenever the source provides them.
- Do not compress a multi-step workflow into a generic one-liner.
- If the source contains a requested action or next step, include that explicitly in the summary.
- Write user-facing prose, not machine shorthand.
- primarySignal must be stable across related emails about the same issue.
- closurePredicate only when the text clearly implies how the case could auto-close.

Document:
"""${documentText}"""
`;

		try {
			const response = await this.llmClient.generateJson<unknown>(prompt);
			return parseCaseExtractorResponse(response);
		} catch (error) {
			if (this.options.strictErrors) {
				throw new Error(
					`CaseExtractor failed: ${
						error instanceof Error ? error.message : "unknown error"
					}`,
				);
			}
			return [];
		}
	}
}
