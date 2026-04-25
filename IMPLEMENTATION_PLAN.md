# Buena Context-Loom: Implementation Plan

This document outlines the architecture, epics, tickets, and go-to strategy for building the Buena Context-Loom as a DB-first property intelligence app. The engine consolidates scattered property data into a hierarchical local database with full traceability, editable facts and cases, and agent access through an MCP server.

> [!IMPORTANT]
> **User Review Required**: Please review the updated DB-first architecture, hierarchical data model, and MCP scope. Once approved, we will execute from Epic 1.

## 1. Architecture Overview (The App Vision)

The core product is an app that ingests property documents, resolves them onto a property hierarchy, and makes the resulting facts and cases queryable by both humans and connected agents.

1. **The Property Runner**: A central orchestrator iterates over the testfiles for a single property and feeds chronological `day-*` inputs into the ingestion pipeline.
2. **The Ingestor Layer (FileType Focus)**: We mock live webhooks by feeding local files into `JsonIngestor`, `CsvIngestor`, `PdfIngestor`, and `EmlIngestor`.
3. **ERP is "Gold" (Read-Only)**: Facts derived from core ERP exports (`stammdaten.json`, `eigentuemer.csv`) are immutable gold standards. AI-extracted facts can never silently overwrite them.
4. **Hierarchical Source of Truth**: Data lives in a local hierarchical database with `properties -> houses -> apartments`. Facts can belong to any level in that hierarchy, and cases can also be attached to any of those levels.
5. **Cases with Ownership**: Cases represent operational issues or workflows. Every case has an owner and may reference supporting facts and source documents.
6. **The Operator UI**: A React app renders the hierarchy, facts, and cases. Users can edit facts and cases directly in the UI, with a warning when changing protected or AI-generated data.
7. **The MCP Server**: A local MCP server exposes structured and semantic access to the hierarchy, facts, and cases so external agents such as Codex can fetch relevant data for a task.

## 2. The Data Perspective (Hierarchical Facts + Cases)

The database is the source of truth. Facts and cases are attached to exactly one scope in the hierarchy, while preserving source traceability.

```typescript
export type EntityScope = "property" | "house" | "apartment";

export interface HierarchyNodeRef {
  entityType: EntityScope;
  entityId: string;
  propertyId: string;
  houseId?: string;
  apartmentId?: string;
}

export interface BuildingFact {
  id: string;
  scope: HierarchyNodeRef;
  category: "core_erp" | "financial" | "maintenance" | "governance" | "communication";
  key: string;
  value: string | number | boolean | null;
  caseId?: string;
  source: {
    fileId: string;
    fileType: "csv" | "json" | "pdf" | "eml";
    ingestionDate: string;
  };
  isGoldStandard: boolean;
  confidenceScore: number;
  embeddingId?: string;
}

export interface Case {
  id: string;
  scope: HierarchyNodeRef;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  ownerUserId: string;
  summary: string;
  sourceFileIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

### Data Model Principles

1. **Hierarchy-first**: Every fact and case must resolve to a property, house, or apartment.
2. **Traceability-first**: Every extracted fact keeps a source reference back to the original file.
3. **Protected ERP facts**: Gold facts remain immutable unless a human explicitly overrides them.
4. **Case-centric operations**: Cases are first-class records, not derived UI views.
5. **Semantic retrieval ready**: Facts and cases should be vectorizable so the MCP server can support semantic lookup when keyword filters are insufficient.

## 3. Epics & Tickets (The Hackathon Sprint)

### Epic 1: Hierarchical Schema & Identity Resolver
*Goal: Create the local database and reliably map incoming records onto `property`, `house`, and `apartment` entities.*
- **Ticket 1.1**: Set up the SQLite schema with Drizzle for `Property`, `House`, `Apartment`, `Fact`, `Case`, `User`, and source-tracking tables.
- **Ticket 1.2**: Implement hierarchy resolution for ERP inputs so incoming rows/files can be matched to the correct property node.
- **Ticket 1.3 [TEST]**: Write tests asserting correct hierarchy creation and gold-fact generation from CSV/JSON inputs.

### Epic 2: Agentic Extraction Pipeline
*Goal: Extract non-ERP facts and cases from unstructured files and attach them to the right hierarchy level without violating the gold-data rule.*
- **Ticket 2.1**: Implement the Gatekeeper prompt to decide whether a document contains relevant operational information.
- **Ticket 2.2**: Implement the Fact Extractor prompt using Google Gemini via `GEMINI_API_KEY`. **CRITICAL:** All fact-generation calls run at `temperature: 0`.
- **Ticket 2.3**: Implement case extraction and linking so emails/PDFs can open or enrich cases on the property, house, or apartment level.
- **Ticket 2.4 [TEST]**: Write tests covering scope resolution, case creation, and ERP protection against silent overwrite.

### Epic 3: Facts & Cases Operator UI
*Goal: Give users a clean interface to inspect and edit the hierarchy, facts, and cases.*
- **Ticket 3.1**: Build the hierarchy navigation for `property -> house -> apartment`.
- **Ticket 3.2**: Build editable detail views for facts and cases, including ownership and source references.
- **Ticket 3.3**: Implement the human-over-AI warning flow before saving edits to protected or AI-generated records.
- **Ticket 3.4 [TEST]**: Add frontend tests for editing flows, warning states, and scope-specific rendering.

### Epic 4: MCP Server & Semantic Retrieval
*Goal: Expose the database to external agents through a local MCP server with both structured and semantic querying.*
- **Ticket 4.1**: Implement an MCP server that can fetch properties, houses, apartments, facts, and cases by identifiers and filters.
- **Ticket 4.2**: Define agent-friendly MCP tools for common workflows such as "get apartment facts", "get open cases", and "get related records for this issue".
- **Ticket 4.3**: Add semantic query support for facts and cases, with vector storage/indexing if keyword search is not sufficient.
- **Ticket 4.4 [TEST]**: Write integration tests for MCP tool responses and semantic retrieval quality on representative prompts.

### Epic 5: Property Runner & End-to-End Simulation
*Goal: Simulate the chronological flow and prove the full ingest-to-query loop.*
- **Ticket 5.1**: Build the `PropertyRunner` that orchestrates the 10-day cycle and persists every ingestion result into the hierarchical database.
- **Ticket 5.2 [TEST]**: Execute the runner against the `day-01` to `day-10` folders and verify resulting facts, cases, and ownership assignments.
- **Ticket 5.3**: Demo the MCP connection from an external agent such as Codex and validate real semantic lookups over the stored data.

---

## 4. Presentation Strategy / Go-To Flow (The Pitch)

1. **The Baseline (Day 0)**: Run the engine on base ERP data and show the seeded hierarchy: property, houses, apartments, and protected gold facts.
2. **The Iterations**: Live-run the `day-*` inputs and show new facts and cases landing on the correct hierarchy nodes.
3. **The Operator Workflow**: Open the UI, inspect a case, change its owner or update a fact, and show the warning flow for protected edits.
4. **The Agent Workflow**: Connect an external agent through MCP and ask for relevant facts and cases, for example: "show me all open water-damage cases related to this house".
5. **The Retrieval Reveal**: Demonstrate semantic lookup by asking for related issues without exact keyword matches, backed by vector search if needed.

## 5. Resolved Strategic Constraints (The "Winning" Rules)

Based on the updated direction, we are locking in these principles:

1. **DB-first architecture**: The database is the product source of truth. We are no longer planning around categorized Markdown files as the main persistence layer.
2. **Mocked webhooks are sufficient**: Local file ingestors are enough to prove the workflow and simulate production event streams.
3. **ERP is protected**: Facts originating from core ERP exports remain gold-standard and cannot be silently replaced by AI output.
4. **Cases are first-class records**: Operational workflows live as explicit `Case` records with owners, statuses, and traceable supporting evidence.
5. **Human edits stay simple**: Users can edit facts and cases in the UI, but the system warns before protected or AI-generated data is changed.
6. **Zero hallucination tolerance**: All LLM calls that create facts or cases run at `temperature: 0`.
7. **Semantic access is part of the product**: The MCP layer must support practical retrieval for agents, and we can add vectorization where semantic search materially improves relevance.
