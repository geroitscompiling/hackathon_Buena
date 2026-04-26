export interface SourceRef {
  fileId: string;
  fileType: "csv" | "json" | "pdf" | "eml";
  ingestionDate: string;
}

export type BuildingFactCategory =
  | "core_erp"
  | "financial"
  | "maintenance"
  | "governance";

/** ERP-stable identifiers for gold imports that must scope to houses/apartments. */
export type BuildingFactErpScope = {
	hausId?: string;
	einheitId: string;
};

export interface BuildingFact {
  id: string;
  propertyId: string;
  category: BuildingFactCategory;
  key: string;
  value: string | number | boolean;
  source: SourceRef;
  isGoldStandard: boolean;
  confidenceScore: number;
  /** ISO calendar date YYYY-MM-DD: when the stated fact applies / becomes valid (not ingestion time). */
  validFrom?: string;
  erpScope?: BuildingFactErpScope;
}

export interface Ingestor {
  ingest(filePath: string, fileId: string): Promise<BuildingFact[]>;
}

export interface LlmJsonClient {
  generateJson<T>(prompt: string): Promise<T>;
}

export interface GatekeeperResult {
  isRelevant: boolean;
}

export interface ExtractedFact {
  category: BuildingFactCategory;
  key: string;
  value: string;
  confidenceScore: number;
  /** Optional; otherwise pipelines default from document / reference date. YYYY-MM-DD. */
  validFrom?: string;
}

export interface FactExtractionContext {
  referenceDate?: string;
}

export interface RelevanceGatekeeper {
  isRelevant(documentText: string): Promise<boolean>;
}

export interface BuildingFactExtractor {
  extract(documentText: string, context?: FactExtractionContext): Promise<ExtractedFact[]>;
}
