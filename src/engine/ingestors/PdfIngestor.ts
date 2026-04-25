import { promises as fs } from "fs";
import crypto from "crypto";
import {
  BuildingFact,
  BuildingFactExtractor,
  Ingestor,
  RelevanceGatekeeper,
} from "../types";

export class PdfIngestor implements Ingestor {
  constructor(
    private readonly gatekeeper: RelevanceGatekeeper,
    private readonly extractor: BuildingFactExtractor,
    private readonly propertyId: string = "LIE-001"
  ) {}

  async ingest(filePath: string, fileId: string): Promise<BuildingFact[]> {
    // Current incremental fixtures expose invoice/pdf metadata via CSV files.
    // We ingest that text now and keep this class swappable for true PDF parsing later.
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
        fileType: "pdf",
        ingestionDate,
      },
      isGoldStandard: false,
      confidenceScore: fact.confidenceScore,
    }));
  }
}
