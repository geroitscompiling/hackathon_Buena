import { getGeminiServiceRuntimeEnv } from "#/env";
import type { EmbeddingClient } from "#/services/semanticIndex";

interface GeminiEmbeddingResponse {
	embedding?: {
		values?: number[];
	};
	embeddings?: Array<{
		values?: number[];
	}>;
}

const RETRYABLE_STATUS_CODES = new Set([429, 503]);
const EMBEDDING_DIMENSIONS = 1536;

export class GeminiEmbeddingService implements EmbeddingClient {
	private lastRequestAt = 0;
	private readonly apiKey: string;
	private readonly model: string;
	private readonly dimensions: number;
	private readonly maxRetries: number;
	private readonly minRequestDelayMs: number;
	private readonly debugEnabled: boolean;

	constructor(options: {
		apiKey?: string;
		model?: string;
		dimensions?: number;
		maxRetries?: number;
		minRequestDelayMs?: number;
		debugEnabled?: boolean;
	} = {}) {
		const runtimeEnv = getGeminiServiceRuntimeEnv();
		this.apiKey = options.apiKey ?? runtimeEnv.GEMINI_API_KEY ?? "";
		this.model = options.model ?? runtimeEnv.GEMINI_MODEL_EMBEDDING ?? "";
		this.dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
		this.maxRetries = options.maxRetries ?? runtimeEnv.GEMINI_MAX_RETRIES;
		this.minRequestDelayMs =
			options.minRequestDelayMs ?? runtimeEnv.GEMINI_MIN_REQUEST_DELAY_MS;
		this.debugEnabled = options.debugEnabled ?? runtimeEnv.GEMINI_DEBUG === "1";

		if (!this.apiKey) {
			throw new Error("GEMINI_API_KEY is required");
		}
		if (!this.model) {
			throw new Error("GEMINI_MODEL_EMBEDDING is required");
		}
	}

	embedDocument(text: string): Promise<number[]> {
		return this.embed(text);
	}

	embedQuery(text: string): Promise<number[]> {
		return this.embed(text);
	}

	private async embed(text: string): Promise<number[]> {
		const totalAttempts = this.maxRetries + 1;
		let attempt = 0;
		let response: Response | null = null;

		while (attempt <= this.maxRetries) {
			const attemptNumber = attempt + 1;
			await this.enforceMinimumDelay();
			response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-goog-api-key": this.apiKey,
					},
					body: JSON.stringify({
						model: `models/${this.model}`,
						content: {
							parts: [{ text }],
						},
						outputDimensionality: this.dimensions,
					}),
				},
			);
			this.lastRequestAt = Date.now();

			if (response.ok) {
				break;
			}

			const errorDetails = await response.text();
			const errorMessage = `Gemini embedding request failed for model ${this.model} (attempt ${attemptNumber}/${totalAttempts}) with status ${response.status}${errorDetails ? `: ${errorDetails}` : ""}`;
			const shouldRetry =
				RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries;
			if (!shouldRetry) {
				throw new Error(errorMessage);
			}

			if (this.debugEnabled) {
				console.warn(errorMessage);
			}
			await this.sleep(this.getRetryDelayMs(response, attempt));
			attempt += 1;
		}

		if (!response?.ok) {
			throw new Error("Gemini embedding request failed without a response");
		}

		const payload = (await response.json()) as GeminiEmbeddingResponse;
		const values = payload.embedding?.values ?? payload.embeddings?.[0]?.values;
		if (!values || values.length === 0) {
			throw new Error("Gemini embedding response did not include vector values");
		}
		if (values.length !== this.dimensions) {
			throw new Error(
				`Gemini embedding service is configured for ${this.dimensions} dimensions but model ${this.model} returned ${values.length}. Check GEMINI_MODEL_EMBEDDING, then recreate/backfill embeddings if the schema dimension changed.`,
			);
		}

		return this.normalize(values);
	}

	private async enforceMinimumDelay(): Promise<void> {
		if (this.minRequestDelayMs <= 0 || this.lastRequestAt === 0) {
			return;
		}

		const elapsedMs = Date.now() - this.lastRequestAt;
		if (elapsedMs >= this.minRequestDelayMs) {
			return;
		}

		await this.sleep(this.minRequestDelayMs - elapsedMs);
	}

	private getRetryDelayMs(response: Response, attempt: number): number {
		const retryAfterHeader = response.headers.get("retry-after");
		const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
		if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds >= 0) {
			return Math.round(retryAfterSeconds * 1000);
		}

		return 500 * 2 ** attempt;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private normalize(values: number[]): number[] {
		const magnitude = Math.hypot(...values);
		if (magnitude === 0) {
			return values;
		}

		return values.map((value) => value / magnitude);
	}
}
