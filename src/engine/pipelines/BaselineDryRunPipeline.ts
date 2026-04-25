import { promises as fs } from "node:fs";
import path from "node:path";
import { CsvIngestor } from "../ingestors/CsvIngestor";
import { EmlIngestor } from "../ingestors/EmlIngestor";
import { JsonIngestor } from "../ingestors/JsonIngestor";
import { PdfIngestor } from "../ingestors/PdfIngestor";
import { FactPersistencePolicy } from "../services/FactPersistencePolicy";
import { FactExtractor } from "../services/FactExtractor";
import { Gatekeeper } from "../services/Gatekeeper";
import { GeminiService } from "../services/GeminiService";
import { HierarchyResolver } from "../services/HierarchyResolver";
import type { BuildingFact, BuildingFactExtractor, RelevanceGatekeeper } from "../types";
import { factApartments, factHouses, facts, properties, sources } from "../../db/schema";
import { getServerEnv } from "#/env";

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
  hierarchyResolver?: Pick<HierarchyResolver, "resolve">;
  factPersistencePolicy?: Pick<FactPersistencePolicy, "evaluate">;
}

export interface BaselineDryRunSummary {
  sourcesPersisted: number;
  factsInserted: number;
  factsBlockedAsConflicts: number;
  factsUpdatedIdempotent: number;
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
  hierarchyResolver,
  factPersistencePolicy,
}: BaselineDryRunOptions): Promise<BaselineDryRunSummary> {
  await db.insert(properties).values({
    id: propertyId,
    name: propertyName,
  });

  const runtimeEnv = getServerEnv();
  const buildGatekeeperLlmClient = () =>
    new GeminiService({ model: runtimeEnv.GEMINI_MODEL_GATEKEEPER });
  const buildExtractorLlmClient = () =>
    new GeminiService({ model: runtimeEnv.GEMINI_MODEL_EXTRACTOR });
  const resolvedGatekeeper =
    gatekeeper ?? new Gatekeeper(buildGatekeeperLlmClient(), { strictErrors: strictAiErrors });
  const resolvedExtractor =
    extractor ?? new FactExtractor(buildExtractorLlmClient(), { strictErrors: strictAiErrors });
  const resolvedHierarchyResolver =
    hierarchyResolver ??
    new HierarchyResolver({
      propertyId,
      houses: [],
    });
  const resolvedFactPersistencePolicy =
    factPersistencePolicy ?? new FactPersistencePolicy();

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

  const persistedFacts: BuildingFact[] = [];
  const existingPolicyFacts: Array<{
    id: string;
    scope: {
      scopeType: "property" | "house" | "apartment";
      propertyId: string;
      houseId?: string;
      apartmentId?: string;
    };
    category: string;
    key: string;
    value: string;
    sourceId: string;
    isGoldStandard: boolean;
  }> = [];
  const sourceIds = new Set<string>();
  let noisySourcesWithFacts = 0;
  let factsInserted = 0;
  let factsBlockedAsConflicts = 0;
  let factsUpdatedIdempotent = 0;

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
      const resolvedScope = await resolvedHierarchyResolver.resolve({
        propertyId: fact.propertyId,
        extractedFact: {
          key: fact.key,
          value: fact.value,
        },
      });

      const policyDecision = await resolvedFactPersistencePolicy.evaluate({
        existingFacts: existingPolicyFacts,
        incomingFact: {
          scope: resolvedScope,
          category: fact.category,
          key: fact.key,
          value: String(fact.value),
          sourceId,
          isGoldStandard: fact.isGoldStandard,
        },
      });

      if (policyDecision.outcome === "blocked_as_conflict") {
        factsBlockedAsConflicts += 1;
        continue;
      }

      if (policyDecision.outcome === "updated_idempotent") {
        factsUpdatedIdempotent += 1;
        continue;
      }

      factsInserted += 1;
      persistedFacts.push(fact);
      await db.insert(facts).values({
        id: fact.id,
        propertyId: resolvedScope.propertyId,
        category: fact.category,
        key: fact.key,
        value: String(fact.value),
        sourceId,
        isGoldStandard: fact.isGoldStandard,
        confidenceScore: fact.confidenceScore,
      });

      if (resolvedScope.scopeType === "house" || resolvedScope.scopeType === "apartment") {
        if (!resolvedScope.houseId) {
          throw new Error("Resolved house/apartment scope is missing required houseId");
        }
        await db.insert(factHouses).values({
          factId: fact.id,
          houseId: resolvedScope.houseId,
        });
      }

      if (resolvedScope.scopeType === "apartment") {
        if (!resolvedScope.apartmentId) {
          throw new Error("Resolved apartment scope is missing required apartmentId");
        }
        await db.insert(factApartments).values({
          factId: fact.id,
          apartmentId: resolvedScope.apartmentId,
        });
      }

      existingPolicyFacts.push({
        id: fact.id,
        scope: resolvedScope,
        category: fact.category,
        key: fact.key,
        value: String(fact.value),
        sourceId,
        isGoldStandard: fact.isGoldStandard,
      });
    }
  }

  const goldFactsPersisted = persistedFacts.filter((fact) => fact.isGoldStandard).length;
  const nonGoldFactsPersisted = persistedFacts.length - goldFactsPersisted;

  return {
    sourcesPersisted: sourceIds.size,
    factsInserted,
    factsBlockedAsConflicts,
    factsUpdatedIdempotent,
    factsPersisted: factsInserted,
    goldFactsPersisted,
    nonGoldFactsPersisted,
    noisySourcesEvaluated: noisyIngestions.length,
    noisySourcesWithFacts,
  };
}
