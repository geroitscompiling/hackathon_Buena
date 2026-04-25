# Buena Context-Loom: Recovery Implementation Plan

This plan replaces the earlier sprint framing and reflects current reality: the DB-first base exists, but hierarchy resolution, case lifecycle, and day-by-day history replay must be completed for a demo-ready story.

> [!IMPORTANT]
> **Execution Mode**: Every ticket follows strict TDD (`test -> fail -> implement -> pass`) and preserves ERP gold-data protection.

## 1. Target Demo Outcome

By demo day, we must show one property whose timeline evolves by replaying `day-01` through `day-10` and results in:

1. **Hierarchy-aware records**: Facts and cases correctly scoped to property, house, or apartment.
2. **Traceable decisions**: Every fact/case points to source documents.
3. **Case lifecycle**: New cases are opened, updated, and resolved across days.
4. **History proof**: We can show how state changed from baseline to latest day.
5. **Gold safety**: ERP facts stay protected unless explicitly overridden by a human workflow.

## 2. Current State Snapshot (Reality Check)

### Already implemented

1. SQLite/Drizzle schema for hierarchy, facts, cases, users, source tracking, and relation tables.
2. Core ERP ingestion (`JsonIngestor`, `CsvIngestor`) producing gold facts.
3. LLM stack (`Gatekeeper`, `FactExtractor`, `GeminiService`) with `temperature: 0`, model split, retry/backoff, and throttling delay.
4. R1 complete for POC: hierarchy resolver wiring, gold-protection policy path, conflict logging, and history runner scaffolding.
5. R2 complete for POC: case domain/types, case extraction (mock/live), deterministic case identity/upsert, fact-case linking, and auto-close evaluation.
6. Baseline + history dry-runs are operational and test suite is green.

### Missing / incomplete

1. Hash-based caching for Gatekeeper/Extractor/CaseExtractor outputs.
2. Full timeline event model (`ingestion_events`) for UI/MCP (optional beyond POC counters).
3. Demo polish/readout work (operator UX is intentionally de-scoped for this POC).

## 3. Data and Domain Contracts (Locked)

The following rules are now mandatory for all implementation tickets:

1. **Single-scope records**: Every fact and case is attached to exactly one scope (`property`, `house`, or `apartment`), while retaining parent IDs.
2. **Case identity strategy**: Cases use deterministic matching keys (source refs + normalized title/signals) to decide open/new vs update existing.
3. **Gold conflict strategy**:
   - AI may append evidence or create non-gold candidate facts.
   - AI may not overwrite effective value of a matching gold fact.
   - Violations are persisted as conflict metadata or separate candidate facts.
4. **History eventing**: Every daily replay step emits a machine-readable ingest summary and persists change events.

## 4. Recovery Epics and Tickets

### Epic R1: Scope Resolution and Gold-Safe Persistence
*Goal: Make ingestion hierarchy-aware and enforce ERP safety rules in persistence.*

- **R1.1 [TEST]**: Add failing tests for scope resolver inputs/outputs (`property`, `house`, `apartment`) using ERP + noisy fixture combinations.
- **R1.2**: Implement `HierarchyResolver` service for deterministic node resolution from document/fact signals.
- **R1.3 [TEST]**: Add failing tests for gold-overwrite scenarios (same semantic key/scope from AI vs ERP).
- **R1.4**: Implement `FactPersistencePolicy` to block silent overwrite and persist conflict/candidate outcomes.
- **R1.5**: Refactor baseline pipeline to route all writes through resolver + policy service.

#### R1 POC Safety Addendum (Demo-Focused Scope)

For hackathon demo reliability, we are intentionally doing lightweight hardening and deferring deeper production behaviors.

- **R1.6 [POC SAFETY] Load Existing Gold Facts Before History Replay**
  - **Goal**: Prevent obvious ERP-overwrite regressions during `make run-history`.
  - **Scope**:
    1. Preload existing persisted gold facts (`scope + category + key`) before replay write decisions.
    2. Reuse current policy logic; do not introduce full conflict engine yet.
  - **Acceptance**:
    1. Replay cannot insert non-gold fact that replaces matching gold semantic identity.
    2. Integration test proves seeded gold fact remains effective after conflicting noisy input.

- **R1.7 [POC SAFETY] Wire Resolver to Real Hierarchy Data**
  - **Goal**: Ensure resolver defaults use real `property -> house -> apartment` data, not empty fixtures.
  - **Scope**:
    1. Build resolver input from DB hierarchy records during run initialization.
    2. Keep matching simple (ID and normalized unit label).
  - **Acceptance**:
    1. At least one replay fact resolves to house scope and one to apartment scope using real hierarchy.
    2. No test-only resolver mocks required for normal baseline/history runs.

- **R1.8 [POC TRACEABILITY] Persist Lightweight Conflict Log**
  - **Goal**: Make blocked writes explainable during demo.
  - **Scope**:
    1. Persist minimal conflict artifact (table or JSONL) with timestamp, source, semantic identity, and reason.
    2. Add summary counter output in history run logs.
  - **Acceptance**:
    1. `make run-history` reports conflict count and where conflicts are stored.
    2. Demo can show at least one blocked conflict record end-to-end.

### Epic R2: Case Extraction and Lifecycle ✅ COMPLETED (POC Scope)
*Outcome: Cases are now first-class in ingestion and history replay.*

Implemented and verified:

1. Case domain contracts (`CaseIntent`, `CaseUpsertCommand`, validators).
2. `CaseExtractor` interface with mock and live Gemini implementations.
3. Deterministic case identity and idempotent upsert (`caseKey` + unique index).
4. Case lifecycle merge/update + auto-close with closure predicates.
5. Fact-to-case linking (`fact_cases`) with tightened heuristic.
6. Pipeline wiring in baseline/history runs with summary counters (`casesOpened`, `casesUpdated`, `casesResolved`, `factCaseLinksCreated`).
7. Test coverage for case domain, identity, merge behavior, extractor, lifecycle integration, and history replay integrity.

Notes for future agents:

- Do not re-implement R2 tickets unless bugs are found.
- Treat current R2 as baseline behavior and only extend incrementally.

### Epic R3: LLM Reliability and Cost Control Hardening
*Goal: Avoid duplicate calls and improve demo reliability under quota pressure.*

- **R3.1 [TEST]**: Add failing tests for source-hash cache behavior (same file rerun must skip LLM call).
- **R3.2**: Implement cache store keyed by `sourceHash + model + promptVersion` for Gatekeeper/Extractor/CaseExtractor.
- **R3.3 [TEST]**: Add tests for cache invalidation when file content changes.
- **R3.4**: Extend diagnose script output to include cache hit/miss and recommended model pairing for demo runs.

### Epic R4: Day-01 to Day-10 History ReplayOkay,
*Goal: Build the timeline engine required for the demo story.*

- **R4.1 [TEST]**: Add failing integration test for chronological replay from `HistoryPopulationData/day-01` to `day-10`.
- **R4.2**: Implement `PropertyHistoryRunner` orchestrator for day-folder ingestion sequence.
- **R4.3 [TEST]**: Add tests for idempotent rerun behavior (same day replay does not duplicate facts/cases/events).
- **R4.4**: Implement `ingestion_events`/history persistence model (day, file, action, entity type/id, before/after fingerprints).
- **R4.5**: Produce per-day summary artifacts for demo (`created_facts`, `updated_facts`, `opened_cases`, `resolved_cases`, conflicts).

### Epic R5: Demo Surface and Verification (POC De-Scoped)
*Goal: Keep demo readable without building full operator UI.*

POC decision:

1. Skip full Epic 3/Operator UI-equivalent work for now.
2. Use script outputs + MCP/query readouts as demo interface.
3. Keep optional lightweight read-only view as stretch goal only.

## 5. Ticket Execution Order (Do This Next)

1. **Completed**: Epic R1 (including R1.6–R1.8 POC safety additions)
2. **Completed**: Epic R2 (POC scope)
3. **Active focus**: Epic R4 history hardening (`ingestion_events`, rerun idempotency, richer day summaries)
4. **Next**: Epic R3 reliability cache if time remains
5. **Deferred**: Epic R5 full UI/polish beyond script/MCP demo outputs

If time is constrained, keep focus on R4 + minimal R3. R1 and R2 are already delivered for this POC.

## 8. Handover Status (For Other Agents)

Current branch status expectations:

1. R1 and R2 code paths are already implemented and test-backed.
2. Do not restart schema/domain work for cases; extend existing services (`CaseExtractor`, `CaseLifecycleService`, pipeline wiring).
3. Use `make run-initial-*` and `make run-history-*` flows for verification.
4. Preserve gold-data protection and `temperature: 0` constraints.
5. Prioritize incremental fixes and R4 timeline improvements over new architecture changes.

## 6. Demo Go-To Flow (Updated Pitch)

1. **Baseline load**: Show property hierarchy + gold ERP facts.
2. **Chronological replay**: Run day-by-day ingestion and show timeline counters changing.
3. **Case story**: Open one case trail and demonstrate how new evidence updates status/summary/ownership context.
4. **Safety proof**: Show an example where AI proposes conflicting value and gold policy prevents silent overwrite.
5. **Agent query**: Ask for open cases or scoped facts and verify answers against timeline/history entries.

## 7. Non-Negotiable Constraints

1. DB-first remains the product source of truth.
2. Mocked local file ingestors remain the webhook simulation mechanism.
3. All fact/case generation prompts use `temperature: 0`.
4. ERP-derived gold facts cannot be silently overwritten by AI output.
5. History replay across `day-01` to `day-10` is mandatory for demo completeness.
