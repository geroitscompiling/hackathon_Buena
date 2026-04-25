import { promises as fs } from "node:fs";
import path from "node:path";
import { CsvIngestor } from "../ingestors/CsvIngestor";
import { EmlIngestor } from "../ingestors/EmlIngestor";
import { JsonIngestor } from "../ingestors/JsonIngestor";
import { PdfIngestor } from "../ingestors/PdfIngestor";
import { FactExtractor } from "../services/FactExtractor";
import { Gatekeeper } from "../services/Gatekeeper";
import { GeminiService } from "../services/GeminiService";
import type { BuildingFact, BuildingFactExtractor, RelevanceGatekeeper } from "../types";
import { facts, properties, sources } from "../../db/schema";

interface DbLike {
  insert: (table: typeof properties | typeof sources | typeof facts) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface BaselineDryRunOptions {
  db: DbLike;
  datasetRootPath?: string;
  propertyId?: string;
  propertyName?: string;
  noisyInputFiles?: string[];
  gatekeeper?: RelevanceGatekeeper;
  extractor?: BuildingFactExtractor;
}

export interface BaselineDryRunSummary {
  sourcesPersisted: number;
  factsPersisted: number;
  goldFactsPersisted: number;
  nonGoldFactsPersisted: number;
}

const defaultNoisyInputFiles = [
  "emails/2026-01/20260101_083800_EMAIL-06547.eml",
  "rechnungen/2025-12/20251203_DL-015_INV-00184.pdf",
];

export async function runBaselineDryRun({
  db,
  datasetRootPath = "testfiles",
  propertyId = "LIE-001",
  propertyName = "WEG Immanuelkirchstraße 26",
  noisyInputFiles = defaultNoisyInputFiles,
  gatekeeper,
  extractor,
}: BaselineDryRunOptions): Promise<BaselineDryRunSummary> {
  await db.insert(properties).values({
    id: propertyId,
    name: propertyName,
  });

  const buildLlmClient = () => new GeminiService();
  const resolvedGatekeeper = gatekeeper ?? new Gatekeeper(buildLlmClient());
  const resolvedExtractor = extractor ?? new FactExtractor(buildLlmClient());

  const coreIngestions = [
    {
      ingestor: new JsonIngestor(),
      relativePath: "stammdaten/stammdaten.json",
    },
    {
      ingestor: new CsvIngestor(),
      relativePath: "stammdaten/eigentuemer.csv",
    },
  ] as const;

  const noisyIngestions = noisyInputFiles.map((relativePath) => ({
    ingestor: relativePath.endsWith(".eml")
      ? new EmlIngestor(resolvedGatekeeper, resolvedExtractor, propertyId)
      : new PdfIngestor(resolvedGatekeeper, resolvedExtractor, propertyId),
    relativePath,
  }));

  const allFacts: BuildingFact[] = [];
  const sourceIds = new Set<string>();

  for (const ingestion of [...coreIngestions, ...noisyIngestions]) {
    const filePath = path.resolve(datasetRootPath, ingestion.relativePath);
    await fs.access(filePath);
    const fileId = path.basename(filePath);
    const factsForFile = await ingestion.ingestor.ingest(filePath, fileId);
    if (factsForFile.length === 0) {
      continue;
    }

    const sourceId = `source-${ingestion.relativePath.replaceAll("/", "-")}`;
    sourceIds.add(sourceId);
    await db.insert(sources).values({
      id: sourceId,
      fileId: factsForFile[0].source.fileId,
      fileType: factsForFile[0].source.fileType,
      ingestionDate: factsForFile[0].source.ingestionDate,
    });

    for (const fact of factsForFile) {
      allFacts.push(fact);
      await db.insert(facts).values({
        id: fact.id,
        propertyId: fact.propertyId,
        category: fact.category,
        key: fact.key,
        value: String(fact.value),
        sourceId,
        isGoldStandard: fact.isGoldStandard,
        confidenceScore: fact.confidenceScore,
      });
    }
  }

  const goldFactsPersisted = allFacts.filter((fact) => fact.isGoldStandard).length;
  const nonGoldFactsPersisted = allFacts.length - goldFactsPersisted;

  return {
    sourcesPersisted: sourceIds.size,
    factsPersisted: allFacts.length,
    goldFactsPersisted,
    nonGoldFactsPersisted,
  };
}
