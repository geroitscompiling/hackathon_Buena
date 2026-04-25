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

export interface BuildingFact {
  id: string;
  propertyId: string;
  category: BuildingFactCategory;
  key: string;
  value: string | number | boolean;
  source: SourceRef;
  isGoldStandard: boolean;
  confidenceScore: number;
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
  value: string | number | boolean;
  confidenceScore: number;
}

export interface RelevanceGatekeeper {
  isRelevant(documentText: string): Promise<boolean>;
}

export interface BuildingFactExtractor {
  extract(documentText: string): Promise<ExtractedFact[]>;
}
