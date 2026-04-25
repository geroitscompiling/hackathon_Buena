import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiService } from "../GeminiService";

describe("GeminiService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("constructs with explicit options when process.env omits gatekeeper/extractor models", () => {
    const runtimeKeys = [
      "GEMINI_API_KEY",
      "GEMINI_MAX_RETRIES",
      "GEMINI_MIN_REQUEST_DELAY_MS",
      "GEMINI_DEBUG",
    ] as const;
    const modelKeys = ["GEMINI_MODEL_GATEKEEPER", "GEMINI_MODEL_EXTRACTOR"] as const;
    const saved: Record<string, string | undefined> = {};
    for (const k of [...runtimeKeys, ...modelKeys]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    try {
      expect(
        () =>
          new GeminiService({
            apiKey: "unit-test-key",
            model: "gemini-test-model",
            maxRetries: 2,
            minRequestDelayMs: 1000,
            debugEnabled: false,
          })
      ).not.toThrow();
    } finally {
      for (const k of [...runtimeKeys, ...modelKeys]) {
        const v = saved[k];
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    }
  });

  it("throws when api key is missing", () => {
    expect(() => new GeminiService({ apiKey: "", model: "gemini-test-model" })).toThrow(
      "GEMINI_API_KEY is required"
    );
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

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-test-model",
      maxRetries: 2,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });
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

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-test-model",
      maxRetries: 2,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });
    const result = await service.generateJson<{ facts: unknown[] }>("Extract");
    expect(result).toEqual({ facts: [] });
  });

  it("uses configured model when sending requests", async () => {
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

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-from-config",
      maxRetries: 2,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });
    await service.generateJson<{ ok: boolean }>("Ping");

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/models/gemini-from-config:generateContent");
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

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-1.5-flash",
      maxRetries: 2,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });

    await expect(service.generateJson("Prompt")).rejects.toThrow(
      'Gemini request failed for model gemini-1.5-flash (attempt 1/'
    );
  });

  it("retries on 429 and succeeds on a follow-up attempt", async () => {
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

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-test-model",
      maxRetries: 2,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });
    const result = await service.generateJson<{ facts: unknown[] }>("Extract");

    expect(result).toEqual({ facts: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 then throws after max retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '{"error":{"message":"service unavailable"}}',
      headers: { get: () => "0" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new GeminiService({
      apiKey: "test-key",
      model: "gemini-test-model",
      maxRetries: 1,
      minRequestDelayMs: 1000,
      debugEnabled: false,
    });

    await expect(service.generateJson("Extract")).rejects.toThrow(
      'Gemini request failed for model gemini-test-model (attempt 2/2) with status 503: {"error":{"message":"service unavailable"}}'
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
