import dotenv from "dotenv";

import { db, queryClient } from "#/db";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import { SemanticIndexService } from "#/services/semanticIndex";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
	const limit = Number.parseInt(process.env.EMBEDDING_BACKFILL_LIMIT ?? "100", 10);
	if (Number.isNaN(limit) || limit <= 0) {
		throw new Error("EMBEDDING_BACKFILL_LIMIT must be a positive integer");
	}

	const summary = await new SemanticIndexService(
		db,
		new GeminiEmbeddingService(),
	).backfillMissingEmbeddings(limit);

	console.log("Embedding backfill complete");
	console.log(JSON.stringify(summary, null, 2));
	await queryClient.end();
}

main().catch((error) => {
	console.error("Embedding backfill failed", error);
	process.exit(1);
});
