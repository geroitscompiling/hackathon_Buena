import { describe, it, expect, vi } from "vitest";
import { FactExtractor } from "../FactExtractor";
import type { LlmJsonClient } from "../../types";

describe("FactExtractor", () => {
  it("returns extracted facts when the model already emits topical keys and absolute-date sentences", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({
        facts: [
          {
            category: "maintenance",
            key: "repair",
            value: "Am 2025-10-24 hat Herr X die Erlaubnis fuer zusaetzliche Reparaturen seiner Heizung angefragt.",
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
        key: "repair",
        value: "Am 2025-10-24 hat Herr X die Erlaubnis fuer zusaetzliche Reparaturen seiner Heizung angefragt.",
        confidenceScore: 0.92,
      },
    ]);
  });

  it("fills validFrom from referenceDate when the model omits it", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({
        facts: [
          {
            category: "maintenance",
            key: "repair",
            value: "Heizung defekt.",
            confidenceScore: 0.9,
          },
        ],
      }),
    };

    const extractor = new FactExtractor(llm);
    const facts = await extractor.extract("Text", { referenceDate: "2026-04-26" });

    expect(facts[0]?.validFrom).toBe("2026-04-26");
  });

  it("filters out invalid categories, malformed records, and primitive values", async () => {
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
            key: "invoice_paid_status",
            value: true,
            confidenceScore: 0.97,
          },
          {
            category: "financial",
            key: "invoice_payment_follow_up",
            value: "Die Rechnung INV-2048 ist seit dem 12.01. offen und wurde zur Zahlung angemahnt.",
            confidenceScore: 0.81,
          },
        ],
      }),
    };

    const extractor = new FactExtractor(llm);
    const facts = await extractor.extract("Invoice details");

    expect(facts).toEqual([
      {
        category: "financial",
        key: "invoice_payment_follow_up",
        value: "Die Rechnung INV-2048 ist seit dem 12.01. offen und wurde zur Zahlung angemahnt.",
        confidenceScore: 0.81,
      },
    ]);
  });

  it("tells the model to emit topical keys and concrete sentence values", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ facts: [] }),
    };
    const extractor = new FactExtractor(llm);

    await extractor.extract("Herr X fragt am 24.10. nach einer Reparaturfreigabe.", {
      referenceDate: "2026-04-26",
    });

    expect(llm.generateJson).toHaveBeenCalledTimes(1);
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      '"key": "topic_tag_like_repair_ownership_payment"'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      '"value": "A concrete fact sentence in English"'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      "Write every fact value in English"
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      "Always use absolute dates"
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'Reference date for resolving relative time expressions: "2026-04-26"'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'If the source says "seven weeks ago" and the reference date is "2026-04-26", rewrite it as "2026-03-08"'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      "Make each fact value as specific as the source allows"
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'avoid "The additional costs for the repair amount to approximately 830.15 EUR." and prefer "The repair of the heating pump in apartment WE 49 was carried out by Firma Mueller on 2026-04-12 for 830.15 EUR."'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'This applies to every fact type, not only repairs'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'prefer "Joanna Schaefer moved out of apartment WE 49 on 2026-03-08."'
    );
    expect(vi.mocked(llm.generateJson).mock.calls[0][0]).toContain(
      'prefer "Invoice INV-2048 from Firma Mueller for heating pump repair in apartment WE 49 is due on 2026-01-12 for 830.15 EUR."'
    );
  });

  it("returns empty list on malformed response body", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ notFacts: [] }),
    };
    const extractor = new FactExtractor(llm);

    await expect(extractor.extract("Invalid")).resolves.toEqual([]);
  });

  it("throws in strict mode when llm call fails", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockRejectedValue(new Error("rate limited")),
    };
    const extractor = new FactExtractor(llm, { strictErrors: true });

    await expect(extractor.extract("Any input")).rejects.toThrow(
      "FactExtractor failed to extract facts"
    );
  });
});
