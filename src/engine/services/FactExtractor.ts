import type {
  BuildingFactCategory,
  BuildingFactExtractor,
  ExtractedFact,
  FactExtractionContext,
  LlmJsonClient,
} from "../types";

interface ExtractorResponse {
  facts?: unknown[];
}

interface FactExtractorOptions {
  strictErrors?: boolean;
}

const allowedCategories: BuildingFactCategory[] = [
  "core_erp",
  "financial",
  "maintenance",
  "governance",
];

export class FactExtractor implements BuildingFactExtractor {
  constructor(
    private readonly llmClient: LlmJsonClient,
    private readonly options: FactExtractorOptions = {}
  ) {}

  async extract(
    documentText: string,
    context?: FactExtractionContext
  ): Promise<ExtractedFact[]> {
    const referenceDateInstruction = context?.referenceDate
      ? `Reference date for resolving relative time expressions: "${context.referenceDate}".
- If the source uses relative time expressions such as "seven weeks ago", "gestern", or "last Monday", resolve them against that reference date and write the absolute date in the fact value.
- If the source says "seven weeks ago" and the reference date is "2026-04-26", rewrite it as "2026-03-08".`
      : `If the document uses relative time expressions, resolve them to absolute dates only when the document itself provides enough context to do so reliably.`;
    const prompt = `
You are an information extractor for a property-management pipeline.
Return valid JSON only using this shape:
{
  "facts": [
    {
      "category": "core_erp" | "financial" | "maintenance" | "governance",
      "key": "topic_tag_like_repair_ownership_payment",
      "value": "A concrete fact sentence in the source language",
      "confidenceScore": 0.0
    }
  ]
}

Rules:
- The key must be a short topical tag for the overall subject, such as "repair", "ownership", "payment", "insurance", or "legal".
- The value must be a concrete, human-readable fact sentence grounded in the document, not a boolean, status flag, or field name.
- Preserve important specifics in the value such as dates, people, unit references, amounts, and requested actions.
- Make each fact value as specific as the source allows. Include the concrete subject of the fact, what exactly happened, who requested or carried out the action, which unit or asset was affected, and any named company, invoice id, amount, or counterparty when present in the source.
- This applies to every fact type, not only repairs.
- Do not compress specific source details into generic summaries.
- For repairs, avoid "The additional costs for the repair amount to approximately 830.15 EUR." and prefer "The repair of the heating pump in apartment WE 49 was carried out by Firma Mueller on 2026-04-12 for 830.15 EUR."
- For ownership or occupancy, avoid "A tenant moved out." and prefer "Joanna Schaefer moved out of apartment WE 49 on 2026-03-08."
- For payments or invoices, avoid "An invoice is due." and prefer "Invoice INV-2048 from Firma Mueller for heating pump repair in apartment WE 49 is due on 2026-01-12 for 830.15 EUR."
- Apply the same level of specificity to legal, insurance, meeting, contract, and governance facts whenever the source provides those details.
- Always use absolute dates such as "2026-04-26" instead of relative dates such as "heute", "gestern", "today", or "yesterday".
- Do not emit generic keys like "email_signal_detected" or long machine-style event keys.
${referenceDateInstruction}

Document:
"""${documentText}"""
`;

    try {
      const response = await this.llmClient.generateJson<ExtractorResponse>(prompt);
      if (!Array.isArray(response.facts)) {
        return [];
      }

      return response.facts
        .map((rawFact) => this.normalizeFact(rawFact))
        .filter((fact): fact is ExtractedFact => fact !== null);
    } catch (error) {
      if (this.options.strictErrors) {
        throw new Error(
          `FactExtractor failed to extract facts: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      return [];
    }
  }

  private normalizeFact(rawFact: unknown): ExtractedFact | null {
    if (!rawFact || typeof rawFact !== "object") {
      return null;
    }

    const candidate = rawFact as Record<string, unknown>;
    const category = candidate.category;
    const key = candidate.key;
    const value = candidate.value;
    const confidenceScore = candidate.confidenceScore;

    if (typeof category !== "string" || !allowedCategories.includes(category as BuildingFactCategory)) {
      return null;
    }

    if (typeof key !== "string" || key.trim().length === 0) {
      return null;
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }

    if (typeof confidenceScore !== "number" || Number.isNaN(confidenceScore)) {
      return null;
    }

    return {
      category: category as BuildingFactCategory,
      key: key.trim(),
      value: value.trim(),
      confidenceScore,
    };
  }
}
