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

    const extractedFacts = await this.extractor.extract(content);
    const ingestionDate = new Date().toISOString();

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
    }));
  }
}
