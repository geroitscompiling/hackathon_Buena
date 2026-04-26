import { describe, expect, it } from "vitest";
import { getPioneerServiceRuntimeEnv, getServerEnv } from "../env";

const PIONEER_RUNTIME_KEYS = [
	"PIONEER_API_KEY",
	"PIONEER_BASE_URL",
	"PIONEER_MODEL_GATEKEEPER",
	"PIONEER_MODEL_EXTRACTOR",
	"GEMINI_MAX_RETRIES",
	"GEMINI_MIN_REQUEST_DELAY_MS",
	"GEMINI_DEBUG",
] as const;

const SERVER_KEYS = [
	"DATABASE_URL",
	"AI_INFERENCE_PROVIDER",
	"GEMINI_API_KEY",
	"GEMINI_MODEL_GATEKEEPER",
	"GEMINI_MODEL_EXTRACTOR",
	"GEMINI_MODEL_EMBEDDING",
	"PIONEER_API_KEY",
	"PIONEER_BASE_URL",
	"PIONEER_MODEL_GATEKEEPER",
	"PIONEER_MODEL_EXTRACTOR",
	"GEMINI_MAX_RETRIES",
	"GEMINI_MIN_REQUEST_DELAY_MS",
	"GEMINI_DEBUG",
] as const;

function snapshotEnv(
	keys: readonly string[],
): Record<string, string | undefined> {
	return Object.fromEntries(keys.map((k) => [k, process.env[k]]));
}

function restoreEnv(saved: Record<string, string | undefined>): void {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

describe("getPioneerServiceRuntimeEnv", () => {
	it("defaults Pioneer inference models to Qwen/Qwen3-32B", () => {
		const saved = snapshotEnv(PIONEER_RUNTIME_KEYS);
		try {
			for (const key of PIONEER_RUNTIME_KEYS) {
				delete process.env[key];
			}
			process.env.PIONEER_API_KEY = "pio_sk_test";

			const env = getPioneerServiceRuntimeEnv();

			expect(env.PIONEER_MODEL_GATEKEEPER).toBe("Qwen/Qwen3-32B");
			expect(env.PIONEER_MODEL_EXTRACTOR).toBe("Qwen/Qwen3-32B");
			expect(env.PIONEER_BASE_URL).toBe("https://api.pioneer.ai/v1");
			expect(env.GEMINI_MAX_RETRIES).toBe(5);
			expect(env.GEMINI_MIN_REQUEST_DELAY_MS).toBe(1000);
		} finally {
			restoreEnv(saved);
		}
	});
});

describe("getServerEnv inference provider validation", () => {
	it("allows Pioneer inference without Gemini generation credentials", () => {
		const saved = snapshotEnv(SERVER_KEYS);
		try {
			for (const key of SERVER_KEYS) {
				delete process.env[key];
			}
			process.env.DATABASE_URL =
				"postgres://postgres:postgres@localhost:5433/buena";
			process.env.AI_INFERENCE_PROVIDER = "pioneer";
			process.env.PIONEER_API_KEY = "pio_sk_test";

			const env = getServerEnv();

			expect(env.AI_INFERENCE_PROVIDER).toBe("pioneer");
			expect(env.PIONEER_MODEL_GATEKEEPER).toBe("Qwen/Qwen3-32B");
			expect(env.PIONEER_MODEL_EXTRACTOR).toBe("Qwen/Qwen3-32B");
			expect(env.GEMINI_API_KEY).toBeUndefined();
			expect(env.GEMINI_MODEL_GATEKEEPER).toBeUndefined();
			expect(env.GEMINI_MODEL_EXTRACTOR).toBeUndefined();
		} finally {
			restoreEnv(saved);
		}
	});
});
