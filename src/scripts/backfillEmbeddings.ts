import dotenv from "dotenv";

import { db, queryClient } from "#/db";
import { GeminiEmbeddingService } from "#/engine/services/GeminiEmbeddingService";
import { SemanticIndexService } from "#/services/semanticIndex";

dotenv.config({ path: [".env.local", ".env"] });

async function main() {
	const batchSize = Number.parseInt(
		process.env.EMBEDDING_BACKFILL_LIMIT ?? "500",
		10,
	);
	if (Number.isNaN(batchSize) || batchSize <= 0) {
		throw new Error("EMBEDDING_BACKFILL_LIMIT must be a positive integer");
	}

	const service = new SemanticIndexService(db, new GeminiEmbeddingService());
	let factsTotal = 0;
	let casesTotal = 0;
	let batch: { factsUpdated: number; casesUpdated: number };
	do {
		batch = await service.backfillMissingEmbeddings(batchSize);
		factsTotal += batch.factsUpdated;
		casesTotal += batch.casesUpdated;
		if (batch.factsUpdated > 0 || batch.casesUpdated > 0) {
			console.log(
				`Backfill batch: +${batch.factsUpdated} facts, +${batch.casesUpdated} cases`,
			);
		}
	} while (batch.factsUpdated > 0 || batch.casesUpdated > 0);

	console.log("Embedding backfill complete");
	console.log(
		JSON.stringify(
			{ factsUpdated: factsTotal, casesUpdated: casesTotal },
			null,
			2,
		),
	);
	await queryClient.end();
}

main().catch((error) => {
	console.error("Embedding backfill failed", error);
	process.exit(1);
});
