import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiService } from "../GeminiService";

describe("GeminiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MAX_RETRIES;
    delete process.env.GEMINI_MIN_REQUEST_DELAY_MS;
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
      'Gemini request failed for model gemini-1.5-flash (attempt 1/4) with status 404: {"error":{"message":"models/gemini-1.5-flash is not found for API version v1beta"}}'
    );
  });

  it("retries on 429 and succeeds on a follow-up attempt", async () => {
    process.env.GEMINI_MAX_RETRIES = "2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => '{"error":{"message":"rate limited"}}',
        headers: { get: () => "0" },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "{\"facts\":[]}" }] } }],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const service = new GeminiService("test-key", "gemini-test-model");
    const result = await service.generateJson<{ facts: unknown[] }>("Extract");

    expect(result).toEqual({ facts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 then throws after max retries", async () => {
    process.env.GEMINI_MAX_RETRIES = "1";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"error":{"message":"service unavailable"}}',
      headers: { get: () => "0" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new GeminiService("test-key", "gemini-test-model");

    await expect(service.generateJson("Extract")).rejects.toThrow(
      'Gemini request failed for model gemini-test-model (attempt 2/2) with status 503: {"error":{"message":"service unavailable"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
