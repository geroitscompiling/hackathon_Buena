import { describe, it, expect, vi } from "vitest";
import { Gatekeeper } from "../Gatekeeper";
import { LlmJsonClient } from "../../types";

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
});
