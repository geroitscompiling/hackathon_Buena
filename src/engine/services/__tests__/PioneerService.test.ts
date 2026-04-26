import { afterEach, describe, expect, it, vi } from "vitest";
import { PioneerService } from "../PioneerService";

describe("PioneerService", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("throws when api key is missing", () => {
		expect(
			() => new PioneerService({ apiKey: "", model: "Qwen/Qwen3-32B" }),
		).toThrow("PIONEER_API_KEY is required");
	});

	it("sends OpenAI-compatible chat request with Pioneer auth and temperature 0", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"isRelevant":true}' } }],
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const service = new PioneerService({
			apiKey: "pio_sk_test",
			model: "Qwen/Qwen3-32B",
			maxRetries: 2,
			minRequestDelayMs: 1000,
			debugEnabled: false,
		});
		await service.generateJson<{ isRelevant: boolean }>("Test prompt");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://api.pioneer.ai/v1/chat/completions");
		expect(init?.headers).toMatchObject({
			"Content-Type": "application/json",
			"X-API-Key": "pio_sk_test",
		});
		const body = JSON.parse(String(init?.body));
		expect(body).toMatchObject({
			model: "Qwen/Qwen3-32B",
			temperature: 0,
			response_format: { type: "json_object" },
			messages: [{ role: "user", content: "Test prompt" }],
		});
	});

	it("parses json from chat completion content", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					choices: [{ message: { content: '{"facts":[]}' } }],
				}),
			}),
		);

		const service = new PioneerService({
			apiKey: "pio_sk_test",
			model: "Qwen/Qwen3-32B",
			maxRetries: 2,
			minRequestDelayMs: 1000,
			debugEnabled: false,
		});

		await expect(
			service.generateJson<{ facts: unknown[] }>("Extract"),
		).resolves.toEqual({
			facts: [],
		});
	});

	it("uses configured base URL without double slashes", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		});
		vi.stubGlobal("fetch", fetchMock);

		const service = new PioneerService({
			apiKey: "pio_sk_test",
			baseUrl: "https://example.test/v1/",
			model: "Qwen/Qwen3-32B",
			maxRetries: 2,
			minRequestDelayMs: 1000,
			debugEnabled: false,
		});
		await service.generateJson<{ ok: boolean }>("Ping");

		const [url] = fetchMock.mock.calls[0];
		expect(String(url)).toBe("https://example.test/v1/chat/completions");
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
					choices: [{ message: { content: '{"facts":[]}' } }],
				}),
			});
		vi.stubGlobal("fetch", fetchMock);

		const service = new PioneerService({
			apiKey: "pio_sk_test",
			model: "Qwen/Qwen3-32B",
			maxRetries: 2,
			minRequestDelayMs: 1000,
			debugEnabled: false,
		});

		await expect(
			service.generateJson<{ facts: unknown[] }>("Extract"),
		).resolves.toEqual({
			facts: [],
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
