import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

const apiKey = process.env.GEMINI_API_KEY ?? "";
const configuredGatekeeperModel =
  process.env.GEMINI_MODEL_GATEKEEPER ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const configuredExtractorModel =
  process.env.GEMINI_MODEL_EXTRACTOR ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

async function fetchJson(url: string): Promise<{
  status: number;
  ok: boolean;
  bodyText: string;
  retryAfter: string | null;
}> {
  const response = await fetch(url);
  return {
    status: response.status,
    ok: response.ok,
    bodyText: await response.text(),
    retryAfter: response.headers.get("retry-after"),
  };
}

async function probeModel(model: string): Promise<void> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: 'Return JSON: {"ok":true}' }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens: 32,
        },
      }),
    }
  );

  const bodyText = await response.text();
  const retryAfter = response.headers.get("retry-after");
  console.log(`\n[probe] model=${model}`);
  console.log(`status=${response.status} ok=${response.ok} retry_after=${retryAfter ?? "n/a"}`);
  if (!response.ok) {
    console.log(`body=${bodyText}`);
    return;
  }

  console.log(`body=${bodyText.slice(0, 300)}${bodyText.length > 300 ? "...(truncated)" : ""}`);
}

async function main(): Promise<void> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required");
  }

  console.log("Gemini diagnose started");
  console.log(`gatekeeper_model=${configuredGatekeeperModel}`);
  console.log(`extractor_model=${configuredExtractorModel}`);

  const modelsResult = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  console.log(
    `\n[list_models] status=${modelsResult.status} ok=${modelsResult.ok} retry_after=${modelsResult.retryAfter ?? "n/a"}`
  );
  if (!modelsResult.ok) {
    console.log(`body=${modelsResult.bodyText}`);
  } else {
    console.log(`body=${modelsResult.bodyText.slice(0, 500)}...(truncated)`);
  }

  await probeModel(configuredGatekeeperModel);
  if (configuredExtractorModel !== configuredGatekeeperModel) {
    await probeModel(configuredExtractorModel);
  }
  await probeModel("gemini-2.0-flash");
}

main().catch((error) => {
  console.error("Gemini diagnose failed", error);
  process.exit(1);
});
