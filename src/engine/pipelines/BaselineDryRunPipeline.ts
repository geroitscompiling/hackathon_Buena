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
import { collectBaselineUnstructuredRelativePaths } from "../baseline/collectBaselineUnstructuredPaths";
import type { ErpStammdatenContext } from "../baseline/loadErpStammdatenContext";
import { loadErpStammdatenContextFromFile } from "../baseline/loadErpStammdatenContext";
import { deriveDocumentMetadataFromText } from "../case/deriveDocumentMetadataFromText";
import type { CaseDocumentExtractor } from "../services/CaseExtractor";
import {
  CaseLifecycleService,
  type NewFactSnapshot,
} from "../services/CaseLifecycleService";
import { CaseAssistOrchestrator } from "../services/CaseAssistOrchestrator";
import type { BuildingFact, BuildingFactExtractor, RelevanceGatekeeper } from "../types";
import type { AppDrizzleDatabase } from "../../db/drizzleTypes.ts";
import {
  apartments,
  factApartments,
  factHouses,
  facts,
  houses,
  properties,
  sources,
  users,
} from "../../db/schema";
import { SemanticIndexService, type EmbeddingClient } from "#/services/semanticIndex";

type BaselineDryRunDb = AppDrizzleDatabase;

/** Injected resolver must support ERP materialization when gold facts carry `erpScope`. */
export type BaselineHierarchyResolver = Pick<
  HierarchyResolver,
  "resolve" | "materializeHouseApartment"
>;

export interface BaselineDryRunOptions {
  db: BaselineDryRunDb;
  datasetRootPath?: string;
  includeCoreIngestions?: boolean;
  propertyId?: string;
  propertyName?: string;
  /** When omitted, all `.eml` / `.pdf` under `emails/` and `rechnungen/` (excluding HistoryPopulationData) are processed. Pass `[]` for none. */
  noisyInputFiles?: string[];
  gatekeeper?: RelevanceGatekeeper;
  extractor?: BuildingFactExtractor;
  strictAiErrors?: boolean;
  hierarchyResolver?: BaselineHierarchyResolver;
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
  caseAssistOrchestrator?: Pick<CaseAssistOrchestrator, "run">;
  semanticIndexService?: Pick<
    SemanticIndexService,
    "refreshFactEmbeddingById" | "refreshCaseEmbeddingById"
  >;
  embeddingClient?: EmbeddingClient;
  /** Override default core ERP file order (paths relative to `datasetRootPath`). */
  coreIngestionRelativePaths?: ReadonlyArray<string>;
}

export interface BaselineDryRunSummary {
  sourcesPersisted: number;
  factsInserted: number;
  factsBlockedAsConflicts: number;
  factsUpdatedIdempotent: number;
  factsPersisted: number;
  goldFactsPersisted: number;
  nonGoldFactsPersisted: number;
  /** Noisy paths scheduled for this run (`noisyInputFiles` length, or default corpus size). */
  noisySourcesScheduled: number;
  /** Noisy files that completed `ingest()` (read file + Gatekeeper, and Extractor when relevant). */
  noisySourcesEvaluated: number;
  noisySourcesWithFacts: number;
  casesOpened: number;
  casesUpdated: number;
  casesResolved: number;
  factCaseLinksCreated: number;
  assistRuns: number;
  assistProposedClose: number;
  assistGuardedClosed: number;
  assistGuardedRejected: number;
  /** Facts that had null embeddings and were embedded during the final backfill pass. */
  embeddingBackfillFacts: number;
  /** Cases that had null embeddings and were embedded during the final backfill pass. */
  embeddingBackfillCases: number;
}

function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (!current || typeof current !== "object") {
      return false;
    }
    const maybe = current as { message?: unknown; code?: unknown; cause?: unknown };
    const message = typeof maybe.message === "string" ? maybe.message : "";
    const code = typeof maybe.code === "string" ? maybe.code : "";
    if (code === "23505" || /unique|constraint|primary key/i.test(message)) {
      return true;
    }
    current = maybe.cause;
  }
  return false;
}

function deriveDocumentMetadataFromFact(
  fact: BuildingFact,
): {
  houseId?: string;
  apartmentId?: string;
  unitLabel?: string;
} {
  if (fact.erpScope?.einheitId && fact.erpScope.hausId) {
    return {
      houseId: `${fact.propertyId}-${fact.erpScope.hausId}`,
      apartmentId: `${fact.propertyId}-${fact.erpScope.einheitId}`,
    };
  }
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

function enrichBuildingFactWithErpHaus(
  fact: BuildingFact,
  ctx: ErpStammdatenContext | null,
): BuildingFact {
  if (!ctx || !fact.erpScope?.einheitId || fact.erpScope.hausId) {
    return fact;
  }
  const row = ctx.unitToHaus.get(fact.erpScope.einheitId);
  if (!row) {
    return fact;
  }
  return {
    ...fact,
    erpScope: { ...fact.erpScope, hausId: row.hausId },
  };
}

async function ensureErpApartmentHierarchyForFact(
  db: BaselineDryRunDb,
  resolver: Pick<HierarchyResolver, "materializeHouseApartment">,
  propertyId: string,
  erpHausId: string,
  erpEinheitId: string,
  ctx: ErpStammdatenContext,
): Promise<void> {
  const housePk = `${propertyId}-${erpHausId}`;
  const aptPk = `${propertyId}-${erpEinheitId}`;
  const unitRow = ctx.unitToHaus.get(erpEinheitId);
  const apartmentName = unitRow?.einheitNr ?? erpEinheitId;
  const houseName = ctx.hausIdToDisplayName.get(erpHausId) ?? erpHausId;
  await db
    .insert(houses)
    .values({ id: housePk, propertyId, name: houseName })
    .onConflictDoNothing();
  await db
    .insert(apartments)
    .values({ id: aptPk, houseId: housePk, name: apartmentName })
    .onConflictDoNothing();
  resolver.materializeHouseApartment(housePk, aptPk, apartmentName);
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
  noisyInputFiles,
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
  caseAssistOrchestrator,
  semanticIndexService,
  embeddingClient,
  coreIngestionRelativePaths,
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
  const assistOrchestrator =
    caseAssistOrchestrator ??
    new CaseAssistOrchestrator(db, lifecycle, {
      embeddingClient: resolvedEmbeddingClient,
    });
  const resolvedHierarchyResolver =
    hierarchyResolver ?? (await buildDefaultHierarchyResolver(db, propertyId));
  const resolvedFactPersistencePolicy =
    factPersistencePolicy ?? new FactPersistencePolicy();

  const datasetRootResolved = path.resolve(datasetRootPath);
  const erpContext = await loadErpStammdatenContextFromFile(
    path.join(datasetRootResolved, "stammdaten/stammdaten.json"),
  );

  const defaultCorePaths = [
    "stammdaten/stammdaten.json",
    "stammdaten/eigentuemer.csv",
  ] as const;
  const corePaths = [...(coreIngestionRelativePaths ?? defaultCorePaths)];
  const coreRelativePathSet = new Set(corePaths);
  const coreIngestions = corePaths.map((relativePath) => {
    if (relativePath.endsWith(".json")) {
      return { ingestor: new JsonIngestor(), relativePath };
    }
    return { ingestor: new CsvIngestor(), relativePath };
  });

  const resolvedNoisyInputFiles =
    noisyInputFiles !== undefined
      ? noisyInputFiles
      : collectBaselineUnstructuredRelativePaths(datasetRootResolved);

  const noisyIngestions = resolvedNoisyInputFiles.map((relativePath) => ({
    ingestor: relativePath.endsWith(".eml")
      ? new EmlIngestor(resolvedGatekeeper, resolvedExtractor, propertyId)
      : new PdfIngestor(resolvedGatekeeper, resolvedExtractor, propertyId),
    relativePath,
  }));
  const noisySourcesScheduled = noisyIngestions.length;

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
  let noisySourcesEvaluated = 0;
  let noisySourcesWithFacts = 0;
  let factsInserted = 0;
  let factsBlockedAsConflicts = 0;
  let factsUpdatedIdempotent = 0;
  let casesOpened = 0;
  let casesUpdated = 0;
  let casesResolved = 0;
  let factCaseLinksCreated = 0;
  let assistRuns = 0;
  let assistProposedClose = 0;
  let assistGuardedClosed = 0;
  let assistGuardedRejected = 0;

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
    const filePath = path.join(datasetRootResolved, ingestion.relativePath);
    await fs.access(filePath);
    const fileId = path.basename(filePath);
    const factsForFile = await ingestion.ingestor.ingest(filePath, fileId);
    const isCoreIngestion = coreRelativePathSet.has(ingestion.relativePath);
    if (!isCoreIngestion) {
      noisySourcesEvaluated += 1;
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
      const enrichedFact = enrichBuildingFactWithErpHaus(fact, erpContext);
      if (
        enrichedFact.erpScope?.einheitId &&
        enrichedFact.erpScope.hausId &&
        erpContext
      ) {
        await ensureErpApartmentHierarchyForFact(
          db,
          resolvedHierarchyResolver,
          propertyId,
          enrichedFact.erpScope.hausId,
          enrichedFact.erpScope.einheitId,
          erpContext,
        );
      }

      const resolvedScope = await resolvedHierarchyResolver.resolve({
        propertyId: enrichedFact.propertyId,
        documentMetadata: deriveDocumentMetadataFromFact(enrichedFact),
        extractedFact: {
          key: enrichedFact.key,
          value: enrichedFact.value,
        },
      });

      const policyDecision = await resolvedFactPersistencePolicy.evaluate({
        existingFacts: existingPolicyFacts,
        incomingFact: {
          scope: resolvedScope,
          category: enrichedFact.category,
          key: enrichedFact.key,
          value: String(enrichedFact.value),
          sourceId,
          isGoldStandard: enrichedFact.isGoldStandard,
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
          category: enrichedFact.category,
          key: enrichedFact.key,
          reason: policyDecision.reason,
        });
        continue;
      }

      if (policyDecision.outcome === "updated_idempotent") {
        factsUpdatedIdempotent += 1;
        closureEvidenceThisFile.push({
          id: enrichedFact.id,
          propertyId: resolvedScope.propertyId,
          key: enrichedFact.key,
          value: String(enrichedFact.value),
          scope: resolvedScope,
        });
        continue;
      }

      factsInserted += 1;
      persistedFacts.push(enrichedFact);
      await db.insert(facts).values({
        id: enrichedFact.id,
        propertyId: resolvedScope.propertyId,
        category: enrichedFact.category,
        key: enrichedFact.key,
        value: String(enrichedFact.value),
        sourceId,
        isGoldStandard: enrichedFact.isGoldStandard,
        confidenceScore: enrichedFact.confidenceScore,
      });

      if (resolvedScope.scopeType === "house" || resolvedScope.scopeType === "apartment") {
        if (!resolvedScope.houseId) {
          throw new Error("Resolved house/apartment scope is missing required houseId");
        }
        await db.insert(factHouses).values({
          factId: enrichedFact.id,
          houseId: resolvedScope.houseId,
        });
      }

      if (resolvedScope.scopeType === "apartment") {
        if (!resolvedScope.apartmentId) {
          throw new Error("Resolved apartment scope is missing required apartmentId");
        }
        await db.insert(factApartments).values({
          factId: enrichedFact.id,
          apartmentId: resolvedScope.apartmentId,
        });
      }

      await resolvedSemanticIndexService.refreshFactEmbeddingById(enrichedFact.id);

      existingPolicyFacts.push({
        id: enrichedFact.id,
        scope: resolvedScope,
        category: enrichedFact.category,
        key: enrichedFact.key,
        value: String(enrichedFact.value),
        sourceId,
        isGoldStandard: enrichedFact.isGoldStandard,
      });

      persistedInThisFile.push({
        id: enrichedFact.id,
        key: enrichedFact.key,
        value: String(enrichedFact.value),
      });
      closureEvidenceThisFile.push({
        id: enrichedFact.id,
        propertyId: resolvedScope.propertyId,
        key: enrichedFact.key,
        value: String(enrichedFact.value),
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
      if (batch.caseKeys.length > 0) {
        const touchedCases = await db.query.cases.findMany({
          where: (caseTable, { and, eq, inArray }) =>
            and(
              eq(caseTable.propertyId, propertyId),
              inArray(caseTable.caseKey, batch.caseKeys),
            ),
          columns: { id: true },
        });
        for (const touchedCase of touchedCases) {
          const assist = await assistOrchestrator.run({
            caseId: touchedCase.id,
            propertyId,
            confidenceThreshold: 0.8,
            nowIso,
          });
          assistRuns += 1;
          if (assist.recommendation.proposedAction === "close_case") {
            assistProposedClose += 1;
          }
          if (assist.guardrailResult?.closed === true) {
            assistGuardedClosed += 1;
          } else if (assist.guardrailResult?.closed === false) {
            assistGuardedRejected += 1;
          }
        }
      }
    }
  }

  const goldFactsPersisted = persistedFacts.filter((fact) => fact.isGoldStandard).length;
  const nonGoldFactsPersisted = persistedFacts.length - goldFactsPersisted;

  let embeddingBackfillFacts = 0;
  let embeddingBackfillCases = 0;
  if (resolvedEmbeddingClient) {
    const batchSize = 500;
    const backfillIndex = new SemanticIndexService(db, resolvedEmbeddingClient);
    let batch: { factsUpdated: number; casesUpdated: number };
    do {
      batch = await backfillIndex.backfillMissingEmbeddings(batchSize);
      embeddingBackfillFacts += batch.factsUpdated;
      embeddingBackfillCases += batch.casesUpdated;
    } while (batch.factsUpdated > 0 || batch.casesUpdated > 0);
  }

  return {
    sourcesPersisted: sourceIds.size,
    factsInserted,
    factsBlockedAsConflicts,
    factsUpdatedIdempotent,
    factsPersisted: factsInserted,
    goldFactsPersisted,
    nonGoldFactsPersisted,
    noisySourcesScheduled,
    noisySourcesEvaluated,
    noisySourcesWithFacts,
    casesOpened,
    casesUpdated,
    casesResolved,
    factCaseLinksCreated,
    assistRuns,
    assistProposedClose,
    assistGuardedClosed,
    assistGuardedRejected,
    embeddingBackfillFacts,
    embeddingBackfillCases,
  };
}
