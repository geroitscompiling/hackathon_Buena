import { describe, it, expect, vi } from "vitest";
import { PdfIngestor } from "../PdfIngestor";
import type { BuildingFactExtractor, RelevanceGatekeeper } from "../../types";

describe("PdfIngestor", () => {
  it("returns empty array when document is irrelevant", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: vi.fn().mockResolvedValue(false),
    };
    const extractor: BuildingFactExtractor = {
      extract: vi.fn().mockResolvedValue([]),
    };
    const ingestor = new PdfIngestor(gatekeeper, extractor);

    const facts = await ingestor.ingest(
      new URL("../../../../testfiles/HistoryPopulationData/day-01/rechnungen_index.csv", import.meta.url).pathname,
      "20260101_DL-001_INV-00195.pdf"
    );

    expect(facts).toEqual([]);
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it("maps extracted facts to BuildingFact with pdf source", async () => {
    const gatekeeper: RelevanceGatekeeper = {
      isRelevant: vi.fn().mockResolvedValue(true),
    };
    const extractor: BuildingFactExtractor = {
      extract: vi.fn().mockResolvedValue([
        {
          category: "financial",
          key: "payment",
          value: "Die Rechnung INV-00195 ueber 1.088,85 EUR ist zur Zahlung faellig.",
          confidenceScore: 0.98,
        },
      ]),
    };
    const ingestor = new PdfIngestor(gatekeeper, extractor);

    const facts = await ingestor.ingest(
      new URL("../../../../testfiles/HistoryPopulationData/day-01/rechnungen_index.csv", import.meta.url).pathname,
      "20260101_DL-001_INV-00195.pdf"
    );

    expect(facts).toHaveLength(1);
    expect(facts[0].isGoldStandard).toBe(false);
    expect(facts[0].validFrom).toBe("2026-01-01");
    expect(facts[0].source.fileType).toBe("pdf");
    expect(facts[0].source.fileId).toBe("20260101_DL-001_INV-00195.pdf");
    expect(extractor.extract).toHaveBeenCalledWith(expect.any(String), {
      referenceDate: "2026-01-01",
    });
  });
});
