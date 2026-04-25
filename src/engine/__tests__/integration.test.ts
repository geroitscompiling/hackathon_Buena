import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sources, facts } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import path from 'node:path';
import { JsonIngestor } from '../ingestors/JsonIngestor';
import { CsvIngestor } from '../ingestors/CsvIngestor';
import { EmlIngestor } from '../ingestors/EmlIngestor';
import type { BuildingFactExtractor, RelevanceGatekeeper } from '../types';

describe('Integration: ERP Ingestors Pipeline', () => {
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

  it('JSON Pipeline: reads stammdaten.json and persists facts as Gold Standard', async () => {
    const ingestor = new JsonIngestor();
    const filePath = path.resolve(__dirname, '../../../testfiles/stammdaten/stammdaten.json');
    const fileId = 'stammdaten.json';
    
    // 1. Ingest facts
    const buildingFacts = await ingestor.ingest(filePath, fileId);
    
    // 2. Persist Source
    // In our simplified test, we use the first fact's source info
    const sourceRef = buildingFacts[0].source;
    const sourceDbId = `source-${fileId}`;
    
    await db.insert(sources).values({
      id: sourceDbId,
      fileId: sourceRef.fileId,
      fileType: sourceRef.fileType,
      ingestionDate: sourceRef.ingestionDate,
    });
    
    // 3. Persist Facts
    for (const fact of buildingFacts) {
      await db.insert(facts).values({
        id: fact.id,
        propertyId: fact.propertyId,
        category: fact.category,
        key: fact.key,
        value: String(fact.value), // Convert strictly to string for DB
        sourceId: sourceDbId,
        isGoldStandard: fact.isGoldStandard,
        confidenceScore: fact.confidenceScore,
      });
    }
    
    // 4. Assert Persistence (baujahr specifically)
    const baujahrFacts = await db.select().from(facts).where(and(
      eq(facts.key, 'baujahr'),
      eq(facts.propertyId, 'LIE-001')
    ));
    
    expect(baujahrFacts.length).toBe(1);
    expect(baujahrFacts[0].value).toBe('1928');
    expect(baujahrFacts[0].isGoldStandard).toBe(true);
    expect(baujahrFacts[0].category).toBe('core_erp');
  });

  it('CSV Pipeline: reads eigentuemer.csv and persists facts as Gold Standard', async () => {
    const ingestor = new CsvIngestor();
    const filePath = path.resolve(__dirname, '../../../testfiles/stammdaten/eigentuemer.csv');
    const fileId = 'eigentuemer.csv';
    
    // 1. Ingest facts
    const buildingFacts = await ingestor.ingest(filePath, fileId);
    
    // 2. Persist Source
    const sourceRef = buildingFacts[0].source;
    const sourceDbId = `source-${fileId}`;
    
    await db.insert(sources).values({
      id: sourceDbId,
      fileId: sourceRef.fileId,
      fileType: sourceRef.fileType,
      ingestionDate: sourceRef.ingestionDate,
    });
    
    // 3. Persist Facts
    for (const fact of buildingFacts) {
      await db.insert(facts).values({
        id: fact.id,
        propertyId: fact.propertyId,
        category: fact.category,
        key: fact.key,
        value: String(fact.value),
        sourceId: sourceDbId,
        isGoldStandard: fact.isGoldStandard,
        confidenceScore: fact.confidenceScore,
      });
    }
    
    // 4. Assert Persistence (Marcus Dowerg specifically)
    const ownerFact = await db.select().from(facts).where(and(
      eq(facts.key, 'owner_EIG-001'),
      eq(facts.sourceId, sourceDbId)
    ));
    
    expect(ownerFact.length).toBe(1);
    expect(ownerFact[0].value).toBe('Herr Marcus Dowerg');
    expect(ownerFact[0].isGoldStandard).toBe(true);
    expect(ownerFact[0].category).toBe('governance');
  });

  it('EML AI Pipeline: persists non-gold facts from mocked AI extraction', async () => {
    const mockGatekeeper: RelevanceGatekeeper = {
      isRelevant: async () => true,
    };
    const mockExtractor: BuildingFactExtractor = {
      extract: async () => [
        {
          category: 'maintenance',
          key: 'water_damage_status',
          value: 'reported',
          confidenceScore: 0.93,
        },
      ],
    };

    const ingestor = new EmlIngestor(mockGatekeeper, mockExtractor);
    const filePath = path.resolve(
      __dirname,
      '../../../testfiles/incremental/day-01/emails/2026-01/20260101_083800_EMAIL-06547.eml'
    );
    const fileId = '20260101_083800_EMAIL-06547.eml';

    const buildingFacts = await ingestor.ingest(filePath, fileId);

    expect(buildingFacts.length).toBe(1);
    expect(buildingFacts[0].isGoldStandard).toBe(false);
    expect(buildingFacts[0].source.fileType).toBe('eml');

    const sourceRef = buildingFacts[0].source;
    const sourceDbId = `source-${fileId}`;

    await db.insert(sources).values({
      id: sourceDbId,
      fileId: sourceRef.fileId,
      fileType: sourceRef.fileType,
      ingestionDate: sourceRef.ingestionDate,
    });

    for (const fact of buildingFacts) {
      await db.insert(facts).values({
        id: fact.id,
        propertyId: fact.propertyId,
        category: fact.category,
        key: fact.key,
        value: String(fact.value),
        sourceId: sourceDbId,
        isGoldStandard: fact.isGoldStandard,
        confidenceScore: fact.confidenceScore,
      });
    }

    const persistedFacts = await db.select().from(facts).where(and(
      eq(facts.key, 'water_damage_status'),
      eq(facts.sourceId, sourceDbId)
    ));

    expect(persistedFacts.length).toBe(1);
    expect(persistedFacts[0].value).toBe('reported');
    expect(persistedFacts[0].isGoldStandard).toBe(false);
    expect(persistedFacts[0].category).toBe('maintenance');
  });
});
