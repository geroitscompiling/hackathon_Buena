import { describe, it, expect } from "vitest";
import path from "path";
import { JsonIngestor } from "../JsonIngestor";

describe("JsonIngestor", () => {
  it("should extract facts from stammdaten.json with gold standard true", async () => {
    const ingestor = new JsonIngestor();
    const filePath = path.resolve(__dirname, "../../../../testfiles/stammdaten/stammdaten.json");
    
    const facts = await ingestor.ingest(filePath, "stammdaten.json");
    
    expect(facts.length).toBeGreaterThan(0);
    
    const baujahrFact = facts.find(f => f.key === "baujahr");
    expect(baujahrFact).toBeDefined();
    expect(baujahrFact?.value).toBe(1928);
    expect(baujahrFact?.category).toBe("core_erp");
    expect(baujahrFact?.isGoldStandard).toBe(true);
    expect(baujahrFact?.confidenceScore).toBe(1.0);
    
    const verwalterFact = facts.find(f => f.key === "verwalter");
    expect(verwalterFact).toBeDefined();
    expect(verwalterFact?.value).toBe("Huber & Partner Immobilienverwaltung GmbH");
    
    const einheitenFact = facts.find(f => f.key === "einheiten_count");
    expect(einheitenFact).toBeDefined();
    expect(einheitenFact?.value).toBe(52); // length of einheiten array
    
    const ownerFact = facts.find(f => f.key === "owner_EIG-001");
    expect(ownerFact).toBeDefined();
    expect(ownerFact?.category).toBe("governance");
    expect(ownerFact?.isGoldStandard).toBe(true);
  });
});
