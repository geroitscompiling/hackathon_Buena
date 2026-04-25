import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sources, facts } from '../schema';
import { eq } from 'drizzle-orm';

describe('Database Schema', () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);
    
    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "sources" (
        "id" text PRIMARY KEY NOT NULL,
        "fileId" text NOT NULL,
        "fileType" text NOT NULL,
        "ingestionDate" text NOT NULL,
        "documentDate" text,
        "anchorReference" text
      );
      
      CREATE TABLE IF NOT EXISTS "facts" (
        "id" text PRIMARY KEY NOT NULL,
        "propertyId" text NOT NULL,
        "category" text NOT NULL,
        "key" text NOT NULL,
        "value" text NOT NULL,
        "sourceId" text NOT NULL,
        "isGoldStandard" integer NOT NULL,
        "confidenceScore" real NOT NULL,
        FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON UPDATE no action ON DELETE no action
      );
    `);
  });

  it('should insert and retrieve a source and a fact', async () => {
    const sourceId = 'source-123';
    const factId = 'fact-123';

    // Insert Source
    await db.insert(sources).values({
      id: sourceId,
      fileId: 'stammdaten.json',
      fileType: 'json',
      ingestionDate: new Date().toISOString(),
    });

    // Insert Fact
    await db.insert(facts).values({
      id: factId,
      propertyId: 'LIE-001',
      category: 'core_erp',
      key: 'baujahr',
      value: '1990', // SQLite stores text/numbers, Drizzle can handle types, but we'll use text for now or JSON
      sourceId: sourceId,
      isGoldStandard: true,
      confidenceScore: 1.0,
    });

    // Retrieve Fact
    const retrievedFacts = await db.select().from(facts).where(eq(facts.id, factId));
    expect(retrievedFacts.length).toBe(1);
    expect(retrievedFacts[0].propertyId).toBe('LIE-001');
    expect(retrievedFacts[0].isGoldStandard).toBe(true);

    // Retrieve Source
    const retrievedSources = await db.select().from(sources).where(eq(sources.id, retrievedFacts[0].sourceId));
    expect(retrievedSources.length).toBe(1);
    expect(retrievedSources[0].fileId).toBe('stammdaten.json');
  });
});
