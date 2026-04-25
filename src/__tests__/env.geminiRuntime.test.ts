import { describe, expect, it } from "vitest";
import { getGeminiServiceRuntimeEnv } from "../env";

const GEMINI_RUNTIME_KEYS = [
  "GEMINI_API_KEY",
  "GEMINI_MAX_RETRIES",
  "GEMINI_MIN_REQUEST_DELAY_MS",
  "GEMINI_DEBUG",
] as const;

function snapshotGeminiRuntimeEnv(): Record<
  (typeof GEMINI_RUNTIME_KEYS)[number],
  string | undefined
> {
  return Object.fromEntries(GEMINI_RUNTIME_KEYS.map((k) => [k, process.env[k]])) as Record<
    (typeof GEMINI_RUNTIME_KEYS)[number],
    string | undefined
  >;
}

function restoreGeminiRuntimeEnv(saved: Record<string, string | undefined>): void {
  for (const k of GEMINI_RUNTIME_KEYS) {
    const v = saved[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("getGeminiServiceRuntimeEnv", () => {
  it("uses numeric defaults when retry and delay vars are absent", () => {
    const saved = snapshotGeminiRuntimeEnv();
    try {
      for (const k of GEMINI_RUNTIME_KEYS) {
        delete process.env[k];
      }
      const env = getGeminiServiceRuntimeEnv();
      expect(env.GEMINI_MAX_RETRIES).toBe(5);
      expect(env.GEMINI_MIN_REQUEST_DELAY_MS).toBe(1000);
      expect(env.GEMINI_API_KEY).toBeUndefined();
    } finally {
      restoreGeminiRuntimeEnv(saved);
    }
  });

  it("does not read GEMINI_MODEL_GATEKEEPER or GEMINI_MODEL_EXTRACTOR", () => {
    const saved = snapshotGeminiRuntimeEnv();
    const savedGatekeeper = process.env.GEMINI_MODEL_GATEKEEPER;
    const savedExtractor = process.env.GEMINI_MODEL_EXTRACTOR;
    try {
      for (const k of GEMINI_RUNTIME_KEYS) {
        delete process.env[k];
      }
      delete process.env.GEMINI_MODEL_GATEKEEPER;
      delete process.env.GEMINI_MODEL_EXTRACTOR;
      expect(() => getGeminiServiceRuntimeEnv()).not.toThrow();
    } finally {
      restoreGeminiRuntimeEnv(saved);
      if (savedGatekeeper === undefined) delete process.env.GEMINI_MODEL_GATEKEEPER;
      else process.env.GEMINI_MODEL_GATEKEEPER = savedGatekeeper;
      if (savedExtractor === undefined) delete process.env.GEMINI_MODEL_EXTRACTOR;
      else process.env.GEMINI_MODEL_EXTRACTOR = savedExtractor;
    }
  });
});
