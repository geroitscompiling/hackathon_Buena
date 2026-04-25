import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiService } from "../GeminiService";

describe("GeminiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_MODEL;
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

  it("uses GEMINI_MODEL when model argument is omitted", async () => {
    process.env.GEMINI_MODEL = "gemini-from-env";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"ok\":true}" }],
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new GeminiService("test-key");
    await service.generateJson<{ ok: boolean }>("Ping");

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/models/gemini-from-env:generateContent");
  });

  it("includes response body when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () =>
          '{"error":{"message":"models/gemini-1.5-flash is not found for API version v1beta"}}',
      })
    );

    const service = new GeminiService("test-key", "gemini-1.5-flash");

    await expect(service.generateJson("Prompt")).rejects.toThrow(
      'Gemini request failed with status 404: {"error":{"message":"models/gemini-1.5-flash is not found for API version v1beta"}}'
    );
  });
});
