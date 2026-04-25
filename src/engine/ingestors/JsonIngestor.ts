import { promises as fs } from "node:fs";
import type { BuildingFact, Ingestor } from "../types";
import crypto from "node:crypto";

export class JsonIngestor implements Ingestor {
  async ingest(filePath: string, fileId: string): Promise<BuildingFact[]> {
    const fileContent = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(fileContent);

    const facts: BuildingFact[] = [];
    const propertyId = data.liegenschaft?.id || "UNKNOWN-PROP";
    const ingestionDate = new Date().toISOString();

    const createFact = (
      category: BuildingFact["category"],
      key: string,
      value: string | number | boolean
    ): BuildingFact => ({
      id: crypto.randomUUID(),
      propertyId,
      category,
      key,
      value,
      source: {
        fileId,
        fileType: "json",
        ingestionDate,
      },
      isGoldStandard: true,
      confidenceScore: 1.0,
    });

    if (data.liegenschaft) {
      if (data.liegenschaft.baujahr) {
        facts.push(createFact("core_erp", "baujahr", data.liegenschaft.baujahr));
      }
      if (data.liegenschaft.verwalter) {
        facts.push(createFact("governance", "verwalter", data.liegenschaft.verwalter));
      }
    }

    if (data.einheiten) {
      facts.push(createFact("core_erp", "einheiten_count", data.einheiten.length));
    }

    if (data.eigentuemer) {
      for (const owner of data.eigentuemer) {
        const ownerName = [owner.anrede, owner.vorname, owner.nachname].filter(Boolean).join(" ");
        facts.push(createFact("governance", `owner_${owner.id}`, ownerName));
      }
    }

    return facts;
  }
}
