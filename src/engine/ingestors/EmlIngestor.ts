import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import type {
  BuildingFact,
  BuildingFactExtractor,
  Ingestor,
  RelevanceGatekeeper,
} from "../types";

export class EmlIngestor implements Ingestor {
  constructor(
    private readonly gatekeeper: RelevanceGatekeeper,
    private readonly extractor: BuildingFactExtractor,
    private readonly propertyId: string = "LIE-001"
  ) {}

  async ingest(filePath: string, fileId: string): Promise<BuildingFact[]> {
    const content = await fs.readFile(filePath, "utf-8");
    const isRelevant = await this.gatekeeper.isRelevant(content);

    if (!isRelevant) {
      return [];
    }

    const ingestionDate = new Date().toISOString();
    const referenceDate = deriveReferenceDate(fileId, ingestionDate);
    const extractedFacts = await this.extractor.extract(content, {
      referenceDate,
    });

    return extractedFacts.map((fact) => ({
      id: crypto.randomUUID(),
      propertyId: this.propertyId,
      category: fact.category,
      key: fact.key,
      value: fact.value,
      source: {
        fileId,
        fileType: "eml",
        ingestionDate,
      },
      isGoldStandard: false,
      confidenceScore: fact.confidenceScore,
      validFrom: fact.validFrom ?? referenceDate,
    }));
  }
}

function deriveReferenceDate(fileId: string, ingestionDate: string): string {
  const compactDate = fileId.match(/^(\d{4})(\d{2})(\d{2})/)?.slice(1).join("-");
  return compactDate ?? ingestionDate.slice(0, 10);
}
