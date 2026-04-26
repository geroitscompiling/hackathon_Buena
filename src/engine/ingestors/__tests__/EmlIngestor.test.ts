import { describe, it, expect, vi } from "vitest";
import { EmlIngestor } from "../EmlIngestor";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../../types";

describe("EmlIngestor", () => {
  it("returns empty array when document is irrelevant", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: vi.fn().mockResolvedValue(false),
    };
    const extractor: BuildingFactExtractor = {
      extract: vi.fn().mockResolvedValue([]),
    };
    const ingestor = new EmlIngestor(gatekeeper, extractor);

    const facts = await ingestor.ingest(
      new URL("../../../../testfiles/HistoryPopulationData/day-01/emails/2026-01/20260101_083800_EMAIL-06547.eml", import.meta.url).pathname,
      "20260101_083800_EMAIL-06547.eml"
    );

    expect(facts).toEqual([]);
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("maps extracted facts to BuildingFact with eml source", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: vi.fn().mockResolvedValue(true),
    };
    const extractor: BuildingFactExtractor = {
      extract: vi.fn().mockResolvedValue([
        {
          category: "governance",
          key: "ownership",
          value: "Ein Eigentuemer hat Widerspruch gegen die Sonderumlage eingelegt.",
          confidenceScore: 0.91,
        },
      ]),
    };
    const ingestor = new EmlIngestor(gatekeeper, extractor);

    const facts = await ingestor.ingest(
      new URL("../../../../testfiles/HistoryPopulationData/day-01/emails/2026-01/20260101_083800_EMAIL-06547.eml", import.meta.url).pathname,
      "20260101_083800_EMAIL-06547.eml"
    );

    expect(facts).toHaveLength(1);
    expect(facts[0].isGoldStandard).toBe(false);
    expect(facts[0].source.fileType).toBe("eml");
    expect(facts[0].source.fileId).toBe("20260101_083800_EMAIL-06547.eml");
    expect(extractor.extract).toHaveBeenCalledWith(expect.any(String), {
      referenceDate: "2026-01-01",
    });
  });
});
