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

export class GeminiService {
  constructor(
    private readonly apiKey: string = process.env.GEMINI_API_KEY ?? "",
    private readonly model: string = "gemini-1.5-flash"
  ) {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is required");
    }
  }

  async generateJson<T>(prompt: string): Promise<T> {
    const response = await fetch(
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

    if (!response.ok) {
      throw new Error(`Gemini request failed with status ${response.status}`);
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
}
