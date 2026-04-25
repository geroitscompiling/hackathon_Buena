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
      "title": "short human title",
      "summary": "1-3 sentences",
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
