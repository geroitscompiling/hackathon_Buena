# Buena Context-Loom: Implementation Plan

This document outlines the architecture, epics, tickets, and go-to strategy for building the "Buena Context-Loom", an intelligent property management app. The engine consolidates scattered property data into a single, living Markdown context file (`BUILDING.md`), complete with traceability, AI query capabilities, and a conflict resolution interface.

> [!IMPORTANT]
> **User Review Required**: Please review the updated Epics, Data Model, and Frontend Vision. Once approved, we will begin execution with Epic 1.

## 1. Architecture Overview (The App Vision)

The core product is an app that visualizes the history of facts for each property and makes them queryable by AI. 

1. **The Property Runner**: A central orchestrator that iterates over the testfiles for a single property. It creates a dedicated folder structure (e.g., `properties/LIE-001/BUILDING.md`) and manages the ingestion flow.
2. **The Ingestor Layer (FileType Focus)**: We mock live Webhooks by feeding the chronological `testfiles/incremental/day-*` folders into FileType ingestors (`JsonIngestor`, `PdfIngestor`, `EmlIngestor`).
3. **ERP is "Gold" (Read-Only)**: Facts derived from core ERP exports (`stammdaten.json`) are immutable "gold" standards. AI-extracted facts can never silently overwrite them.
4. **The Surgical Patcher & Single File Git History**: The engine maintains exactly ONE Markdown file per property. Every AI update to this file is instantly committed to a local Git repository. This Git history attached to the single file translates into the "Timeline of Facts" consumed by the frontend.
4. **The UI & Conflict Resolution**: A React app rendering the Markdown and the History. If AI wants to overwrite a human edit or a "Gold" fact, a Conflict Resolution Interface pops up.
5. **The Queryable Agent**: An AI agent connected to the UI that can query the facts and history (e.g., "show me everything door related").

## 2. The Data Perspective (BuildingFact Model)

Every piece of extracted information becomes a `BuildingFact`. This perfectly supports the "ERP is Gold" rule.

```typescript
export interface BuildingFact {
  id: string;               // UUID
  propertyId: string;       // e.g., "LIE-001"
  category: "core_erp" | "financial" | "maintenance" | "governance"; 
  key: string;              // e.g., "baujahr"
  value: string | number | boolean; 
  
  // Traceability to the file/iteration
  source: {
    fileId: string;         // e.g., "stammdaten.json" or "LTR-0001.pdf"
    fileType: "csv" | "json" | "pdf" | "eml"; 
    ingestionDate: string;  
  };
  
  // THE "GOLD" RULE: If true, this came from ERP. AI cannot overwrite this silently.
  isGoldStandard: boolean;  
  confidenceScore: number;  
}
```

## 3. Epics & Tickets (The Hackathon Sprint)

### Epic 1: Identity & Schema Resolver (The Sensors)
*Goal: Load CSVs/JSONs and map everything to the `BuildingFact` model with `isGoldStandard: true`.*
- **Ticket 1.1**: Set up SQLite schema with Drizzle (`Fact` table).
- **Ticket 1.2**: Implement `CsvIngestor` and `JsonIngestor`.
- **Ticket 1.3**: Write tests asserting standard `Fact` generation.

### Epic 2: The Agentic Signal-Filter (The Brain)
*Goal: Extract `BuildingFacts` from unstructured data (`isGoldStandard: false`) safely.*
- **Ticket 2.1**: Implement the "Gatekeeper" prompt (is this document relevant?).
- **Ticket 2.2**: Implement the "Fact Extractor" prompt using **Google Gemini** (configured via `GEMINI_API_KEY` in `.env`). **CRITICAL:** Use `temperature: 0` to completely eliminate AI hallucinations during fact generation.

### Epic 3: Surgical Markdown Patcher & Git Versioning (The USP)
*Goal: Update `BUILDING.md` and commit to Git.*
- **Ticket 3.1**: Define the `BUILDING.md` template schema with hidden anchors.
- **Ticket 3.2**: Implement `SectionPatcher` to inject facts using Regex/AST.
- **Ticket 3.3**: Implement `GitTrackerService` for automatic commits.

### Epic 4: Traceability UI & The Query Agent (The Frontend App)
*Goal: A frontend visualizing the Golden Record, History, and providing Agentic queries.*
- **Ticket 4.1**: Build the Layout (Markdown on left, Timeline/Sources on right).
- **Ticket 4.2**: Implement Click-to-Source (Clicking a Ref badge highlights the exact file/row).
- **Ticket 4.3**: **Human-Over-AI Interface**. Keep it simple: Humans can freely overwrite AI edits, but the UI throws a simple warning message before saving.
- **Ticket 4.4**: **The Analysis Agent (Chat UI)**. An AI assistant that can query `BUILDING.md` and the Git history to answer: *"show me all water damages"* or *"What is the status of the doors?"*.

### Epic 5: The Property Runner & "Living" Iterations
*Goal: Simulate the chronological flow and generate the single Git-backed Markdown file.*
- **Ticket 5.1**: Build the `PropertyRunner`. It orchestrates the 10-Day cycle, uses the Gatekeeper/Patcher, and creates/updates exactly ONE Markdown file per property in a dedicated folder.
- **Ticket 5.2 [TEST]**: Execute the runner against the `day-01` to `day-10` folders to generate the complete Git history consumed by the frontend.
- **Ticket 5.3**: Integrate Entire.io and Aikido AI.

---

## 4. Presentation Strategy / Go-To Flow (The Pitch)

1. **The Baseline (Day 0)**: Run the engine on base test data (`stammdaten`). Show the pristine `BUILDING.md` and the "Gold Standard" facts.
2. **The Iterations (Creating History)**: Live-run the "iterations" (`day-*`).
3. **The Reveal**: Visual updates happen in real-time. The Git log populates the timeline. 
4. **The Agent Query**: Ask the Chat UI "Show me all events related to the heating system."
5. **The Failover/Conflict**: Simulate a destructive AI edit and show the Conflict Resolution Interface blocking it.

## 5. Resolved Strategic Constraints (The "Winning" Rules)

Based on our refinements, we have locked in these core principles:
1. **Mocked Webhooks are Sufficient**: We do not need live APIs. The major win for the judges is proving the *history generation* and the *distilled querying* (e.g., "Show me all water damages" via the frontend agent).
2. **Simple Human Override**: We will not overcomplicate conflict resolution. Humans can freely overwrite AI edits; the system just presents a simple warning message first.
3. **Zero Hallucination Tolerance**: The 10-day iteration runs 100% automatically. To prevent hallucinations during record creation, all Fact-Extraction LLM calls will strictly run at `temperature: 0`.
4. **Edge Cases**: We will handle schema alignment dynamically and adapt as we encounter issues in the `incremental` data.
