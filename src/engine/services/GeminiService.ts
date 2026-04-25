import { getServerEnv } from "#/env";

interface GeminiGeneratePart {
  text?: string;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiGeneratePart[];
    };
  }>;
}

const RETRYABLE_STATUS_CODES = new Set([429, 503]);

interface GeminiServiceOptions {
  apiKey?: string;
  model: string;
  maxRetries?: number;
  minRequestDelayMs?: number;
  debugEnabled?: boolean;
}

export class GeminiService {
  private lastRequestAt = 0;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly minRequestDelayMs: number;
  private readonly debugEnabled: boolean;

  constructor(options: GeminiServiceOptions) {
    const runtimeEnv = getServerEnv();
    this.maxRetries = options.maxRetries ?? runtimeEnv.GEMINI_MAX_RETRIES;
    this.minRequestDelayMs =
      options.minRequestDelayMs ?? runtimeEnv.GEMINI_MIN_REQUEST_DELAY_MS;
    this.debugEnabled = options.debugEnabled ?? runtimeEnv.GEMINI_DEBUG === "1";
    this.apiKey = options.apiKey ?? runtimeEnv.GEMINI_API_KEY;
    this.model = options.model;
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
  }

  async generateJson<T>(prompt: string): Promise<T> {
    const totalAttempts = this.maxRetries + 1;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt <= this.maxRetries) {
      const attemptNumber = attempt + 1;
      await this.enforceMinimumDelay();
      if (this.debugEnabled) {
        console.log(
          `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} sending request`,
        );
      }
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
        }
      );
      this.lastRequestAt = Date.now();

      if (response.ok) {
        if (this.debugEnabled) {
          console.log(
            `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} success`,
          );
        }
        break;
      }

      const errorDetails = await response.text();
      const detailSuffix = errorDetails ? `: ${errorDetails}` : "";
      const errorMessage = `Gemini request failed for model ${this.model} (attempt ${attemptNumber}/${totalAttempts}) with status ${response.status}${detailSuffix}`;
      const shouldRetry =
        RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries;
      if (!shouldRetry) {
        throw new Error(errorMessage);
      }

      const retryAfterMs = this.getRetryDelayMs(response, attempt);
      if (this.debugEnabled) {
        console.warn(
          `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} status=${response.status} retrying_in_ms=${retryAfterMs}`,
        );
      }
      await this.sleep(retryAfterMs);
      attempt += 1;
    }

    if (!response?.ok) {
      throw new Error("Gemini request failed without a response");
    }

    const payload = (await response.json()) as GeminiGenerateResponse;
    const jsonText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!jsonText) {
      throw new Error("Gemini returned an empty response");
    }

    return JSON.parse(jsonText) as T;
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
    const parsedRetryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    if (!Number.isNaN(parsedRetryAfterSec) && parsedRetryAfterSec >= 0) {
      return Math.round(parsedRetryAfterSec * 1000);
    }

    const baseBackoffMs = 500 * 2 ** attempt;
    const jitterMs = Math.floor(Math.random() * 250);
    return baseBackoffMs + jitterMs;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
