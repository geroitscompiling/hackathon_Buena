import { describe, expect, it } from "vitest";
import { GeminiService } from "../GeminiService";
import { createConfiguredLlmJsonClient } from "../LlmJsonClientFactory";
import { PioneerService } from "../PioneerService";

describe("createConfiguredLlmJsonClient", () => {
	it("creates Gemini clients by default", () => {
		const client = createConfiguredLlmJsonClient("gatekeeper", {
			DATABASE_URL: "postgres://postgres:postgres@localhost:5433/buena",
			GEMINI_API_KEY: "gemini-key",
			GEMINI_MODEL_GATEKEEPER: "gemini-gatekeeper",
			GEMINI_MODEL_EXTRACTOR: "gemini-extractor",
			GEMINI_MODEL_EMBEDDING: "gemini-embedding",
			GEMINI_MAX_RETRIES: 5,
			GEMINI_MIN_REQUEST_DELAY_MS: 1000,
			GEMINI_DEBUG: undefined,
			AI_INFERENCE_PROVIDER: "gemini",
			PIONEER_API_KEY: undefined,
			PIONEER_MODEL_GATEKEEPER: "Qwen/Qwen3-32B",
			PIONEER_MODEL_EXTRACTOR: "Qwen/Qwen3-32B",
			PIONEER_BASE_URL: "https://api.pioneer.ai/v1",
		});

		expect(client).toBeInstanceOf(GeminiService);
	});

	it("creates Pioneer clients with Qwen3-32B model defaults when selected", () => {
		const gatekeeper = createConfiguredLlmJsonClient("gatekeeper", {
			DATABASE_URL: "postgres://postgres:postgres@localhost:5433/buena",
			GEMINI_API_KEY: undefined,
			GEMINI_MODEL_GATEKEEPER: undefined,
			GEMINI_MODEL_EXTRACTOR: undefined,
			GEMINI_MODEL_EMBEDDING: undefined,
			GEMINI_MAX_RETRIES: 5,
			GEMINI_MIN_REQUEST_DELAY_MS: 1000,
			GEMINI_DEBUG: undefined,
			AI_INFERENCE_PROVIDER: "pioneer",
			PIONEER_API_KEY: "pio_sk_test",
			PIONEER_MODEL_GATEKEEPER: "Qwen/Qwen3-32B",
			PIONEER_MODEL_EXTRACTOR: "Qwen/Qwen3-32B",
			PIONEER_BASE_URL: "https://api.pioneer.ai/v1",
		});

		expect(gatekeeper).toBeInstanceOf(PioneerService);
	});
});
