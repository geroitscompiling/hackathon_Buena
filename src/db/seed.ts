import Database from "better-sqlite3";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";
import { seedDatabase } from "./seed-data";

dotenv.config({ path: [".env.local", ".env"] });

const dbUrl = process.env.DATABASE_URL || "local.db";

async function seed() {
	const sqlite = new Database(dbUrl);
	const db = drizzle(sqlite, { schema });

	console.log("🌱 Seeding database...");

	try {
		const summary = await seedDatabase(db, sqlite);

		console.log("✅ Database seeded with demo hierarchy data.");
		console.table(summary);
	} finally {
		sqlite.close();
	}
}

seed().catch((error) => {
	console.error("❌ Failed to seed database.");
	console.error(error);
	process.exitCode = 1;
});
