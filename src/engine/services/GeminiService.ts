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

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MIN_REQUEST_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([429, 503]);

export class GeminiService {
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string = process.env.GEMINI_API_KEY ?? "",
    private readonly model: string = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  ) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
  }

  async generateJson<T>(prompt: string): Promise<T> {
    const maxRetries = Number(process.env.GEMINI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
    const totalAttempts = maxRetries + 1;
    const debugEnabled = process.env.GEMINI_DEBUG === "1";
    let attempt = 0;
    let response: Response | null = null;

    while (attempt <= maxRetries) {
      const attemptNumber = attempt + 1;
      await this.enforceMinimumDelay();
      if (debugEnabled) {
        console.log(
          `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} sending request`
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
        if (debugEnabled) {
          console.log(
            `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} success`
          );
        }
        break;
      }

      const errorDetails = await response.text();
      const detailSuffix = errorDetails ? `: ${errorDetails}` : "";
      const errorMessage = `Gemini request failed for model ${this.model} (attempt ${attemptNumber}/${totalAttempts}) with status ${response.status}${detailSuffix}`;
      const shouldRetry =
        RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries;
      if (!shouldRetry) {
        throw new Error(errorMessage);
      }

      const retryAfterMs = this.getRetryDelayMs(response, attempt);
      if (debugEnabled) {
        console.warn(
          `[GeminiService] model=${this.model} attempt=${attemptNumber}/${totalAttempts} status=${response.status} retrying_in_ms=${retryAfterMs}`
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
    const minRequestDelayMs = Number(
      process.env.GEMINI_MIN_REQUEST_DELAY_MS ?? DEFAULT_MIN_REQUEST_DELAY_MS
    );
    if (minRequestDelayMs <= 0 || this.lastRequestAt === 0) {
      return;
    }

    const elapsedMs = Date.now() - this.lastRequestAt;
    if (elapsedMs >= minRequestDelayMs) {
      return;
    }

    await this.sleep(minRequestDelayMs - elapsedMs);
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

export { DEFAULT_GEMINI_MODEL };
