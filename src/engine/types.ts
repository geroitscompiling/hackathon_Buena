export interface SourceRef {
  fileId: string;
  fileType: "csv" | "json" | "pdf" | "eml";
  ingestionDate: string;
}

export interface BuildingFact {
  id: string;
  propertyId: string;
  category: "core_erp" | "financial" | "maintenance" | "governance";
  key: string;
  value: string | number | boolean;
  source: SourceRef;
  isGoldStandard: boolean;
  confidenceScore: number;
}
