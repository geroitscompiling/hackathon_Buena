import { promises as fs } from "node:fs";
import path from "node:path";
import { CsvIngestor } from "../ingestors/CsvIngestor";
import { EmlIngestor } from "../ingestors/EmlIngestor";
import { JsonIngestor } from "../ingestors/JsonIngestor";
import { PdfIngestor } from "../ingestors/PdfIngestor";
import { FactPersistencePolicy } from "../services/FactPersistencePolicy";
import { FactExtractor } from "../services/FactExtractor";
import { GeminiEmbeddingService } from "../services/GeminiEmbeddingService";
import { Gatekeeper } from "../services/Gatekeeper";
import { GeminiService } from "../services/GeminiService";
import { HierarchyResolver } from "../services/HierarchyResolver";
import { deriveDocumentMetadataFromText } from "../case/deriveDocumentMetadataFromText";
import type { CaseDocumentExtractor } from "../services/CaseExtractor";
import {
  CaseLifecycleService,
  type NewFactSnapshot,
} from "../services/CaseLifecycleService";
import type { BuildingFact, BuildingFactExtractor, RelevanceGatekeeper } from "../types";
import {
  factApartments,
  factHouses,
  facts,
  properties,
  sources,
  users,
} from "../../db/schema";
import type { db as appDb } from "../../db";
import { SemanticIndexService, type EmbeddingClient } from "#/services/semanticIndex";

type BaselineDryRunDb = typeof appDb;

export interface BaselineDryRunOptions {
  db: BaselineDryRunDb;
  datasetRootPath?: string;
  includeCoreIngestions?: boolean;
  propertyId?: string;
  propertyName?: string;
  noisyInputFiles?: string[];
  gatekeeper?: RelevanceGatekeeper;
  extractor?: BuildingFactExtractor;
  strictAiErrors?: boolean;
  hierarchyResolver?: Pick<HierarchyResolver, "resolve">;
  factPersistencePolicy?: Pick<FactPersistencePolicy, "evaluate">;
  preloadedExistingFacts?: Array<{
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
  }>;
  onConflict?: (entry: {
    timestamp: string;
    sourceId: string;
    scopeType: "property" | "house" | "apartment";
    propertyId: string;
    houseId?: string;
    apartmentId?: string;
    category: string;
    key: string;
    reason: "existing_gold_fact_same_semantic_identity";
  }) => Promise<void> | void;
  /** When set, runs case extraction + lifecycle after noisy facts persist (R2.6). */
  caseExtractor?: CaseDocumentExtractor;
  /** Caps merged case intents for the whole run (mock dry-run readability). */
  maxCasesPerRun?: number;
  caseLifecycleService?: CaseLifecycleService;
  semanticIndexService?: Pick<
    SemanticIndexService,
    "refreshFactEmbeddingById" | "refreshCaseEmbeddingById"
  >;
  embeddingClient?: EmbeddingClient;
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
  casesOpened: number;
  casesUpdated: number;
  casesResolved: number;
  factCaseLinksCreated: number;
}

const defaultNoisyInputFiles = [
  "emails/2026-01/20260101_074000_EMAIL-06545.eml",
  "rechnungen/2025-12/20251203_DL-015_INV-00184.pdf",
];

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { message?: unknown; code?: unknown };
  const message =
    typeof maybeError.message === "string" ? maybeError.message : "";
  const code = typeof maybeError.code === "string" ? maybeError.code : "";

  return code === "23505" || /unique|constraint|primary key/i.test(message);
}

function deriveDocumentMetadataFromFact(
  fact: BuildingFact,
): {
  houseId?: string;
  apartmentId?: string;
  unitLabel?: string;
} {
  const raw = `${fact.key} ${String(fact.value)}`;
  const apartmentMatch = raw.match(/\b([A-Z]{3}-\d{3}-H\d+-A\d+)\b/);
  if (apartmentMatch?.[1]) {
    const apartmentId = apartmentMatch[1];
    const houseId = apartmentId.split("-A")[0];
    return { houseId, apartmentId };
  }

  const houseMatch = raw.match(/\b([A-Z]{3}-\d{3}-H\d+)\b/);
  if (houseMatch?.[1]) {
    return { houseId: houseMatch[1] };
  }

  const unitLabelMatch = raw.match(/\b(Unit\s+\d+)\b/i);
  if (unitLabelMatch?.[1]) {
    return { unitLabel: unitLabelMatch[1] };
  }

  return {};
}

async function buildDefaultHierarchyResolver(
  db: BaselineDryRunDb,
  propertyId: string,
): Promise<HierarchyResolver> {
  const propertiesQuery = db.query?.properties;
  if (!propertiesQuery?.findFirst) {
    return new HierarchyResolver({ propertyId, houses: [] });
  }

  try {
    const property = (await propertiesQuery.findFirst({
      where: (propertiesTable, operators) =>
        operators.eq(propertiesTable.id, propertyId),
      with: {
        houses: {
          with: {
            apartments: true,
          },
        },
      },
    })) as
      | {
          id: string;
          houses: Array<{
            id: string;
            apartments: Array<{ id: string; name: string }>;
          }>;
        }
      | undefined;

    if (!property) {
      return new HierarchyResolver({ propertyId, houses: [] });
    }

    return new HierarchyResolver({
      propertyId: property.id,
      houses: property.houses.map((house) => ({
        id: house.id,
        apartments: house.apartments.map((apartment) => ({
          id: apartment.id,
          name: apartment.name,
        })),
      })),
    });
  } catch {
    return new HierarchyResolver({ propertyId, houses: [] });
  }
}

async function ensureDefaultCaseOwner(db: BaselineDryRunDb): Promise<void> {
  await db
    .insert(users)
    .values({
      id: "user-1",
      name: "Default Owner",
      email: "owner@buena.test",
    })
    .onConflictDoNothing();
}

export async function runBaselineDryRun({
  db,
  datasetRootPath = "testfiles",
  includeCoreIngestions = true,
  propertyId = "LIE-001",
  propertyName = "WEG Immanuelkirchstraße 26",
  noisyInputFiles = defaultNoisyInputFiles,
  gatekeeper,
  extractor,
  strictAiErrors = false,
  hierarchyResolver,
  factPersistencePolicy,
  preloadedExistingFacts = [],
  onConflict,
  caseExtractor,
  maxCasesPerRun,
  caseLifecycleService,
  semanticIndexService,
  embeddingClient,
}: BaselineDryRunOptions): Promise<BaselineDryRunSummary> {
  await db
    .insert(properties)
    .values({
      id: propertyId,
      name: propertyName,
    })
    .onConflictDoNothing();

  let resolvedGatekeeper: RelevanceGatekeeper | undefined = gatekeeper;
  let resolvedExtractor: BuildingFactExtractor | undefined = extractor;

  if (!gatekeeper || !extractor) {
    const { getServerEnv } = await import("#/env");
    const runtimeEnv = getServerEnv();
    if (!gatekeeper) {
      const llmClient = new GeminiService({ model: runtimeEnv.GEMINI_MODEL_GATEKEEPER });
      resolvedGatekeeper = new Gatekeeper(llmClient, {
        strictErrors: strictAiErrors,
      });
    }
    if (!extractor) {
      const llmClient = new GeminiService({ model: runtimeEnv.GEMINI_MODEL_EXTRACTOR });
      resolvedExtractor = new FactExtractor(llmClient, {
        strictErrors: strictAiErrors,
      });
    }
  }

  if (!resolvedGatekeeper || !resolvedExtractor) {
    throw new Error("BaselineDryRunPipeline failed to initialize AI services");
  }

  let resolvedEmbeddingClient = embeddingClient;
  if (!resolvedEmbeddingClient && process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL_EMBEDDING) {
    resolvedEmbeddingClient = new GeminiEmbeddingService();
  }
  const resolvedSemanticIndexService =
    semanticIndexService ?? new SemanticIndexService(db, resolvedEmbeddingClient);

  const lifecycle =
    caseLifecycleService ??
    new CaseLifecycleService(db, {
      semanticIndexService: resolvedSemanticIndexService,
    });
  const resolvedHierarchyResolver =
    hierarchyResolver ?? (await buildDefaultHierarchyResolver(db, propertyId));
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
  }> = [...preloadedExistingFacts];
  const sourceIds = new Set<string>();
  let noisySourcesWithFacts = 0;
  let factsInserted = 0;
  let factsBlockedAsConflicts = 0;
  let factsUpdatedIdempotent = 0;
  let casesOpened = 0;
  let casesUpdated = 0;
  let casesResolved = 0;
  let factCaseLinksCreated = 0;

  if (caseExtractor) {
    await ensureDefaultCaseOwner(db);
  }

  const ingestions = [
    ...(includeCoreIngestions ? coreIngestions : []),
    ...noisyIngestions,
  ];
  let remainingCaseBudget =
    maxCasesPerRun !== undefined && maxCasesPerRun >= 0 ? maxCasesPerRun : undefined;

  for (const ingestion of ingestions) {
    const filePath = path.resolve(datasetRootPath, ingestion.relativePath);
    await fs.access(filePath);
    const fileId = path.basename(filePath);
    const factsForFile = await ingestion.ingestor.ingest(filePath, fileId);
    const isCoreIngestion =
      ingestion.relativePath === "stammdaten/stammdaten.json" ||
      ingestion.relativePath === "stammdaten/eigentuemer.csv";
    if (ingestion.relativePath !== "stammdaten/stammdaten.json" && ingestion.relativePath !== "stammdaten/eigentuemer.csv") {
      if (factsForFile.length > 0) {
        noisySourcesWithFacts += 1;
      }
    }

    const sourceId = `source-${ingestion.relativePath.replaceAll("/", "-")}`;
    if (factsForFile.length > 0) {
      sourceIds.add(sourceId);
      try {
        await db.insert(sources).values({
          id: sourceId,
          fileId: factsForFile[0].source.fileId,
          fileType: factsForFile[0].source.fileType,
          ingestionDate: factsForFile[0].source.ingestionDate,
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const persistedInThisFile: Array<{ id: string; key: string; value: string }> = [];
    const closureEvidenceThisFile: NewFactSnapshot[] = [];

    for (const fact of factsForFile) {
      const resolvedScope = await resolvedHierarchyResolver.resolve({
        propertyId: fact.propertyId,
        documentMetadata: deriveDocumentMetadataFromFact(fact),
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
        await onConflict?.({
          timestamp: new Date().toISOString(),
          sourceId,
          scopeType: resolvedScope.scopeType,
          propertyId: resolvedScope.propertyId,
          houseId: resolvedScope.houseId,
          apartmentId: resolvedScope.apartmentId,
          category: fact.category,
          key: fact.key,
          reason: policyDecision.reason,
        });
        continue;
      }

      if (policyDecision.outcome === "updated_idempotent") {
        factsUpdatedIdempotent += 1;
        closureEvidenceThisFile.push({
          id: fact.id,
          propertyId: resolvedScope.propertyId,
          key: fact.key,
          value: String(fact.value),
          scope: resolvedScope,
        });
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
      await resolvedSemanticIndexService.refreshFactEmbeddingById(fact.id);

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

      persistedInThisFile.push({
        id: fact.id,
        key: fact.key,
        value: String(fact.value),
      });
      closureEvidenceThisFile.push({
        id: fact.id,
        propertyId: resolvedScope.propertyId,
        key: fact.key,
        value: String(fact.value),
        scope: resolvedScope,
      });
    }

    if (caseExtractor && !isCoreIngestion) {
      if (remainingCaseBudget !== undefined && remainingCaseBudget <= 0) {
        continue;
      }
      const documentText = await fs.readFile(filePath, "utf-8");
      let intents = await caseExtractor.extract(documentText, { propertyId });
      if (remainingCaseBudget !== undefined) {
        intents = intents.slice(0, remainingCaseBudget);
        remainingCaseBudget -= intents.length;
      }
      const docMeta = deriveDocumentMetadataFromText(documentText);
      const nowIso = new Date().toISOString();
      const batch = await lifecycle.processIntentsForDocument({
        propertyId,
        intents,
        resolver: resolvedHierarchyResolver,
        documentMetadata: docMeta,
        nowIso,
      });
      casesOpened += batch.casesOpened;
      casesUpdated += batch.casesUpdated;
      const linkCount = await lifecycle.linkFactsToCasesHeuristic({
        caseKeys: batch.caseKeys,
        propertyId,
        factsForBatch: persistedInThisFile,
      });
      factCaseLinksCreated += linkCount;
      casesResolved += await lifecycle.evaluateAutoClose({
        propertyId,
        newFacts: closureEvidenceThisFile,
        nowIso,
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
    casesOpened,
    casesUpdated,
    casesResolved,
    factCaseLinksCreated,
  };
}
