import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sources, facts } from './schema';
import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

// Ensure we have a database URL (defaults to local.db)
const dbUrl = process.env.DATABASE_URL || 'local.db';

const sqlite = new Database(dbUrl);
const db = drizzle(sqlite);

async function seed() {
  console.log('🌱 Seeding database...');

  // Reset existing data (optional, be careful in production!)
  sqlite.exec('DELETE FROM facts');
  sqlite.exec('DELETE FROM sources');

  console.log('✅ Database seeded!');
}

seed().catch(console.error);
