import { describe, it, expect, vi } from "vitest";
import { Gatekeeper } from "../Gatekeeper";
import type { LlmJsonClient } from "../../types";

describe("Gatekeeper", () => {
  it("returns true for relevant response", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ isRelevant: true }),
    };
    const gatekeeper = new Gatekeeper(llm);

    await expect(gatekeeper.isRelevant("Water leak in building")).resolves.toBe(true);
  });

  it("returns false for irrelevant response", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ isRelevant: false }),
    };
    const gatekeeper = new Gatekeeper(llm);

    await expect(gatekeeper.isRelevant("Generic newsletter")).resolves.toBe(false);
  });

  it("returns false for malformed llm response", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockResolvedValue({ nope: "invalid-shape" }),
    };
    const gatekeeper = new Gatekeeper(llm);

    await expect(gatekeeper.isRelevant("Broken output")).resolves.toBe(false);
  });

  it("throws in strict mode when llm call fails", async () => {
    const llm: LlmJsonClient = {
      generateJson: vi.fn().mockRejectedValue(new Error("network timeout")),
    };
    const gatekeeper = new Gatekeeper(llm, { strictErrors: true });

    await expect(gatekeeper.isRelevant("Any text")).rejects.toThrow(
      "Gatekeeper failed to evaluate document relevance"
    );
  });
});
