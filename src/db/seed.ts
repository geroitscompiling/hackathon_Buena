import dotenv from "dotenv";

import { db, queryClient } from "./index";
import { seedDatabase } from "./seed-data";

dotenv.config({ path: [".env.local", ".env"] });

async function seed() {
	console.log("🌱 Seeding database...");

	try {
		const summary = await seedDatabase(db);

		console.log("✅ Database seeded with demo hierarchy data.");
		console.table(summary);
	} finally {
		await queryClient.end();
	}
}

seed().catch((error) => {
	console.error("❌ Failed to seed database.");
	console.error(error);
	process.exitCode = 1;
});
