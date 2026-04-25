import { promises as fs } from "fs";
import { BuildingFact, Ingestor } from "../types";
import crypto from "crypto";

export class CsvIngestor implements Ingestor {
  async ingest(filePath: string, fileId: string): Promise<BuildingFact[]> {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== "");
    
    if (lines.length === 0) return [];

    const headers = lines[0].split(",");
    const idIdx = headers.indexOf("id");
    const anredeIdx = headers.indexOf("anrede");
    const vornameIdx = headers.indexOf("vorname");
    const nachnameIdx = headers.indexOf("nachname");
    
    const facts: BuildingFact[] = [];
    const ingestionDate = new Date().toISOString();
    const propertyId = "LIE-001"; // Defaulting as agreed

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",");
      if (columns.length !== headers.length) continue;
      
      const id = columns[idIdx];
      if (!id) continue;

      const ownerName = [
        columns[anredeIdx],
        columns[vornameIdx],
        columns[nachnameIdx]
      ].filter(Boolean).join(" ");

      facts.push({
        id: crypto.randomUUID(),
        propertyId,
        category: "governance",
        key: `owner_${id}`,
        value: ownerName,
        source: {
          fileId,
          fileType: "csv",
          ingestionDate,
        },
        isGoldStandard: true,
        confidenceScore: 1.0,
      });
    }

    return facts;
  }
}
