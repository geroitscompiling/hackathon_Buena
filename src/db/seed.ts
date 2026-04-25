import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });

// Ensure we have a database URL (defaults to local.db)
const dbUrl = process.env.DATABASE_URL || "local.db";

const sqlite = new Database(dbUrl);

async function seed() {
	console.log("🌱 Seeding database...");

	// Reset existing data (optional, be careful in production!)
	sqlite.exec("DELETE FROM fact_cases");
	sqlite.exec("DELETE FROM fact_apartments");
	sqlite.exec("DELETE FROM fact_houses");
	sqlite.exec("DELETE FROM cases");
	sqlite.exec("DELETE FROM facts");
	sqlite.exec("DELETE FROM sources");
	sqlite.exec("DELETE FROM apartments");
	sqlite.exec("DELETE FROM houses");
	sqlite.exec("DELETE FROM properties");
	sqlite.exec("DELETE FROM users");

	console.log("✅ Database seeded!");
}

seed().catch(console.error);
