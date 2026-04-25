import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiService } from "../GeminiService";

describe("GeminiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when api key is missing", () => {
    expect(() => new GeminiService("")).toThrow("GEMINI_API_KEY is required");
  });

  it("sends generation request with temperature 0", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"isRelevant\":true}" }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new GeminiService("test-key", "gemini-test-model");
    await service.generateJson<{ isRelevant: boolean }>("Test prompt");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("parses json response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "{\"facts\":[]}" }],
              },
            },
          ],
        }),
      })
    );

    const service = new GeminiService("test-key");
    const result = await service.generateJson<{ facts: unknown[] }>("Extract");
    expect(result).toEqual({ facts: [] });
  });
});
