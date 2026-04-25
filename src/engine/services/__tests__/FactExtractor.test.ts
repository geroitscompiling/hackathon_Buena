import { describe, it, expect, vi } from "vitest";
import { FactExtractor } from "../FactExtractor";
import type { LlmJsonClient } from "../../types";

describe("FactExtractor", () => {
  it("returns normalized extracted facts", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({
        facts: [
          {
            category: "maintenance",
            key: "water_damage",
            value: "Leak in cellar",
            confidenceScore: 0.92,
          },
        ],
      }),
    };

    const extractor = new FactExtractor(llm);
    const facts = await extractor.extract("Mieter meldet Wasserschaden im Keller.");

    expect(facts).toEqual([
      {
        category: "maintenance",
        key: "water_damage",
        value: "Leak in cellar",
        confidenceScore: 0.92,
      },
    ]);
  });

  it("filters out invalid categories and malformed records", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({
        facts: [
          {
            category: "invalid",
            key: "ignore_me",
            value: "bad",
            confidenceScore: 0.7,
          },
          {
            category: "financial",
            key: "invoice_total",
            value: 1088.85,
            confidenceScore: 0.97,
          },
        ],
      }),
    };

    const extractor = new FactExtractor(llm);
    const facts = await extractor.extract("Invoice details");

    expect(facts).toEqual([
      {
        category: "financial",
        key: "invoice_total",
        value: 1088.85,
        confidenceScore: 0.97,
      },
    ]);
  });

  it("returns empty list on malformed response body", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ notFacts: [] }),
    };
    const extractor = new FactExtractor(llm);

    await expect(extractor.extract("Invalid")).resolves.toEqual([]);
  });
});
