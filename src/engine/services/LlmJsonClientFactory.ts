import type { ServerEnv } from "#/env";
import type { LlmJsonClient } from "../types";
import { GeminiService } from "./GeminiService";
import { PioneerService } from "./PioneerService";

type LlmClientPurpose = "gatekeeper" | "extractor";

export function createConfiguredLlmJsonClient(
	purpose: LlmClientPurpose,
	env: ServerEnv,
): LlmJsonClient {
	if (env.AI_INFERENCE_PROVIDER === "pioneer") {
		return new PioneerService({
			apiKey: env.PIONEER_API_KEY,
			baseUrl: env.PIONEER_BASE_URL,
			model:
				purpose === "gatekeeper"
					? env.PIONEER_MODEL_GATEKEEPER
					: env.PIONEER_MODEL_EXTRACTOR,
			maxRetries: env.GEMINI_MAX_RETRIES,
			minRequestDelayMs: env.GEMINI_MIN_REQUEST_DELAY_MS,
			debugEnabled: env.GEMINI_DEBUG === "1",
		});
	}

	return new GeminiService({
		apiKey: env.GEMINI_API_KEY,
		model:
			purpose === "gatekeeper"
				? requireEnvValue(
						env.GEMINI_MODEL_GATEKEEPER,
						"GEMINI_MODEL_GATEKEEPER",
					)
				: requireEnvValue(env.GEMINI_MODEL_EXTRACTOR, "GEMINI_MODEL_EXTRACTOR"),
		maxRetries: env.GEMINI_MAX_RETRIES,
		minRequestDelayMs: env.GEMINI_MIN_REQUEST_DELAY_MS,
		debugEnabled: env.GEMINI_DEBUG === "1",
	});
}

function requireEnvValue(value: string | undefined, key: string): string {
	if (!value) {
		throw new Error(`${key} is required`);
	}
	return value;
}
