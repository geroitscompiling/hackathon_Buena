import { describe, it, expect } from "vitest";
import path from "node:path";
import { CsvIngestor } from "../CsvIngestor";

describe("CsvIngestor", () => {
  it("should extract facts from eigentuemer.csv with gold standard true", async () => {
    const ingestor = new CsvIngestor();
    const filePath = path.resolve(__dirname, "../../../../testfiles/stammdaten/eigentuemer.csv");
    
    const facts = await ingestor.ingest(filePath, "eigentuemer.csv");
    
    expect(facts.length).toBeGreaterThan(0);
    
    const ownerFact = facts.find(f => f.key === "owner_EIG-001");
    expect(ownerFact).toBeDefined();
    expect(ownerFact?.value).toBe("Herr Marcus Dowerg");
    expect(ownerFact?.category).toBe("governance");
    expect(ownerFact?.isGoldStandard).toBe(true);
    expect(ownerFact?.confidenceScore).toBe(1.0);
    expect(ownerFact?.propertyId).toBe("LIE-001");
  });
});
