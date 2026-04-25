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

interface BaselineDryRunDb {
  insert: (...args: unknown[]) => {
    values: (...args: unknown[]) => Promise<unknown> | unknown;
  };
}

export interface BaselineDryRunOptions {
  db: BaselineDryRunDb;
  datasetRootPath?: string;
  propertyId?: string;
  propertyName?: string;
  noisyInputFiles?: string[];
  gatekeeper?: RelevanceGatekeeper;
  extractor?: BuildingFactExtractor;
  strictAiErrors?: boolean;
}

export interface BaselineDryRunSummary {
  sourcesPersisted: number;
  factsPersisted: number;
  goldFactsPersisted: number;
  nonGoldFactsPersisted: number;
  noisySourcesEvaluated: number;
  noisySourcesWithFacts: number;
}

const defaultNoisyInputFiles = [
  "emails/2026-01/20260101_074000_EMAIL-06545.eml",
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
  strictAiErrors = false,
}: BaselineDryRunOptions): Promise<BaselineDryRunSummary> {
  await db.insert(properties).values({
    id: propertyId,
    name: propertyName,
  });

  const gatekeeperModel = process.env.GEMINI_MODEL_GATEKEEPER ?? process.env.GEMINI_MODEL;
  const extractorModel = process.env.GEMINI_MODEL_EXTRACTOR ?? process.env.GEMINI_MODEL;
  const buildGatekeeperLlmClient = () => new GeminiService(undefined, gatekeeperModel);
  const buildExtractorLlmClient = () => new GeminiService(undefined, extractorModel);
  const resolvedGatekeeper =
    gatekeeper ?? new Gatekeeper(buildGatekeeperLlmClient(), { strictErrors: strictAiErrors });
  const resolvedExtractor =
    extractor ?? new FactExtractor(buildExtractorLlmClient(), { strictErrors: strictAiErrors });

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
  let noisySourcesWithFacts = 0;

  for (const ingestion of [...coreIngestions, ...noisyIngestions]) {
    const filePath = path.resolve(datasetRootPath, ingestion.relativePath);
    await fs.access(filePath);
    const fileId = path.basename(filePath);
    const factsForFile = await ingestion.ingestor.ingest(filePath, fileId);
    if (factsForFile.length === 0) {
      continue;
    }
    if (ingestion.relativePath !== "stammdaten/stammdaten.json" && ingestion.relativePath !== "stammdaten/eigentuemer.csv") {
      noisySourcesWithFacts += 1;
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
    noisySourcesEvaluated: noisyIngestions.length,
    noisySourcesWithFacts,
  };
}
