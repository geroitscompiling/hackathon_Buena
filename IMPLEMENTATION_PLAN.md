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
4. Baseline dry-run and passing test suite.

### Missing / incomplete

1. Automatic hierarchy resolver for non-ERP facts/cases (house/apartment resolution in pipeline).
2. Case extraction + upsert/linking from unstructured docs.
3. Deterministic ERP overwrite protection policy in write path.
4. Hash-based caching for Gatekeeper/Extractor outputs.
5. Day-by-day history runner (`day-01` ... `day-10`) that persists a timeline of changes.

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

### Epic R2: Case Extraction and Lifecycle
*Goal: Create and evolve cases from unstructured files with ownership and traceability.*

- **R2.1 [TEST]**: Add failing tests for case extraction output shape and scope mapping.
- **R2.2**: Implement `CaseExtractor` prompt and parser (Gemini, `temperature: 0`) to produce case intents.
- **R2.3 [TEST]**: Add failing tests for case upsert behavior (open new, enrich existing, transition status).
- **R2.4**: Implement `CaseLifecycleService` with deterministic matching + status transitions.
- **R2.5**: Link extracted facts to case records (`fact_cases`) where confidence and matching rules permit.
- **R2.6**: Add owner assignment strategy (default queue user with deterministic assignment override hooks).

### Epic R3: LLM Reliability and Cost Control Hardening
*Goal: Avoid duplicate calls and improve demo reliability under quota pressure.*

- **R3.1 [TEST]**: Add failing tests for source-hash cache behavior (same file rerun must skip LLM call).
- **R3.2**: Implement cache store keyed by `sourceHash + model + promptVersion` for Gatekeeper/Extractor/CaseExtractor.
- **R3.3 [TEST]**: Add tests for cache invalidation when file content changes.
- **R3.4**: Extend diagnose script output to include cache hit/miss and recommended model pairing for demo runs.

### Epic R4: Day-01 to Day-10 History Replay
*Goal: Build the timeline engine required for the demo story.*

- **R4.1 [TEST]**: Add failing integration test for chronological replay from `HistoryPopulationData/day-01` to `day-10`.
- **R4.2**: Implement `PropertyHistoryRunner` orchestrator for day-folder ingestion sequence.
- **R4.3 [TEST]**: Add tests for idempotent rerun behavior (same day replay does not duplicate facts/cases/events).
- **R4.4**: Implement `ingestion_events`/history persistence model (day, file, action, entity type/id, before/after fingerprints).
- **R4.5**: Produce per-day summary artifacts for demo (`created_facts`, `updated_facts`, `opened_cases`, `resolved_cases`, conflicts).

### Epic R5: Demo Surface and Verification
*Goal: Ensure the app can visibly prove hierarchy + cases + history to judges.*

- **R5.1 [TEST]**: Add UI/API tests for timeline rendering and day-by-day case evolution.
- **R5.2**: Implement timeline/history view wired to persisted ingestion events.
- **R5.3**: Add one-click demo script (`make run-demo-history`) that resets DB, replays days, and prints headline metrics.
- **R5.4**: Final hardening checklist run (tests, lint/check, dry-run baseline, dry-run history, diagnose).

## 5. Ticket Execution Order (Do This Next)

1. **Week Slice A (foundation fix)**: R1.1 -> R1.5
2. **Week Slice B (cases)**: R2.1 -> R2.6
3. **Week Slice C (history core)**: R4.1 -> R4.5
4. **Week Slice D (reliability + demo polish)**: R3.1 -> R3.4, then R5.1 -> R5.4

If time is constrained, do not skip R1/R2/R4; they are the minimum for the promised demo narrative.

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
