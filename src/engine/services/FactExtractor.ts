import {
  BuildingFactCategory,
  BuildingFactExtractor,
  ExtractedFact,
  LlmJsonClient,
} from "../types";

interface ExtractorResponse {
  facts?: unknown[];
}

const allowedCategories: BuildingFactCategory[] = [
  "core_erp",
  "financial",
  "maintenance",
  "governance",
];

export class FactExtractor implements BuildingFactExtractor {
  constructor(private readonly llmClient: LlmJsonClient) {}

  async extract(documentText: string): Promise<ExtractedFact[]> {
    const prompt = `
You are an information extractor for a property-management pipeline.
Return valid JSON only using this shape:
{
  "facts": [
    {
      "category": "core_erp" | "financial" | "maintenance" | "governance",
      "key": "snake_case_key",
      "value": "string | number | boolean",
      "confidenceScore": 0.0
    }
  ]
}

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
    } catch {
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

    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return null;
    }

    if (typeof confidenceScore !== "number" || Number.isNaN(confidenceScore)) {
      return null;
    }

    return {
      category: category as BuildingFactCategory,
      key: key.trim(),
      value,
      confidenceScore,
    };
  }
}
