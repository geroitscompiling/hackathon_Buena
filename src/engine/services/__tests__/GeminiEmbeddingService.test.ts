import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiEmbeddingService } from "../GeminiEmbeddingService";

describe("GeminiEmbeddingService", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("normalizes embedding vectors from the Gemini API response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					embedding: {
						values: [3, 4],
					},
				}),
				{ status: 200 },
			),
		);

		const service = new GeminiEmbeddingService({
			apiKey: "test-key",
			model: "gemini-embedding-001",
			dimensions: 2,
			minRequestDelayMs: 0,
		});

		await expect(
			service.embedQuery("task: search result | query: leak on roof"),
		).resolves.toEqual([0.6, 0.8]);
	});

	it("throws when the response is missing vector values", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ embeddings: [] }), { status: 200 }),
		);

		const service = new GeminiEmbeddingService({
			apiKey: "test-key",
			model: "gemini-embedding-001",
			dimensions: 1536,
			minRequestDelayMs: 0,
		});

		await expect(service.embedDocument("title: fact | text: ...")).rejects.toThrow(
			/vector values/i,
		);
	});

	it("throws a clear error when the returned vector length does not match the configured dimensions", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					embedding: {
						values: new Array(768).fill(0.5),
					},
				}),
				{ status: 200 },
			),
		);

		const service = new GeminiEmbeddingService({
			apiKey: "test-key",
			model: "gemini-embedding-001",
			dimensions: 1536,
			minRequestDelayMs: 0,
		});

		await expect(service.embedDocument("title: fact | text: ...")).rejects.toThrow(
			/configured for 1536 dimensions.*returned 768/i,
		);
	});
});
