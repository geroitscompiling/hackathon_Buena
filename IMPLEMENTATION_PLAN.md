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

1. Postgres + Drizzle baseline with local Docker startup via `make db-setup` (including `pgvector` extension).
2. Core ERP ingestion (`JsonIngestor`, `CsvIngestor`) producing gold facts.
3. R1 and R2 behavior is implemented in code: hierarchy resolution, gold protection path, case extraction/lifecycle, auto-close rules, and fact-case linking.
4. Semantic search is available via API + MCP and integrated into frontend search page.
5. Baseline/history dry-runs and passing test suite.

### Missing / incomplete

1. Epic 4 hardening of semantic retrieval + MCP tooling + agent loop behavior (see Epic 4 tickets below).
2. Hash-based caching for Gatekeeper/Extractor/CaseExtractor outputs.
3. Full timeline event model (`ingestion_events`) for UI/MCP (optional beyond POC counters).

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

High-level milestones (details are ticketed below as **R2.0–R2.8**):

- **Milestone A [TEST]**: Case extraction contract + fixtures (mock/live parity).
- **Milestone B**: Live `CaseExtractor` (Gemini JSON, `temperature: 0`) + parser hardening.
- **Milestone C [TEST]**: Deterministic case identity + upsert across multi-day evidence.
- **Milestone D**: DB persistence + `fact_cases` linking + history wiring + summary counters.
- **Milestone E [TEST]**: Full-dataset integrity guardrails (no duplicate case spam).

#### R2 Refined Ticket Cards (POC + Full Dataset)

**What a Case is (POC definition)**  
A **case** is an operational workflow record stored in `cases` (title, summary, status, owner, scope to property/house/apartment, timestamps). **Facts** are evidence atoms in `facts`. Cases may reference many sources; facts link back to a single `sources` row. The demo may highlight **one** case narrative, but the engine must support **many** cases across the full `day-01`…`day-10` dataset without collisions or duplicate spam.

---

**R2.0 — Case domain types and validation**
- **Objective**: Lock JSON shapes and invariants before any LLM or DB wiring.
- **Tasks**:
  1. Add `CaseIntent` / `CaseUpsertCommand` types (id hints optional; `caseKey` required for matching).
  2. Zod (or equivalent) validators: required fields, allowed `status` enum, scope consistency.
- **Acceptance**: Unit tests fail on malformed extractor output; valid payloads parse.

---

**R2.1 [TEST] — Case extraction contract (mock + live parity)**
- **Objective**: Same interface for `HISTORY_MODE=mock` and live Gemini.
- **Tasks**:
  1. Define `CaseExtractor` interface: `(documentText, metadata) -> CaseIntent[]`.
  2. Tests with **fixture strings** covering: open incident, invoice dispute, generic noise (empty intents).
- **Acceptance**: Mock implementation passes tests; live implementation behind same interface (tests mock the HTTP layer).

---

**R2.2 — `CaseExtractor` (live): prompt + parser at `temperature: 0`**
- **Objective**: Extract 0..N case intents from an email/PDF text chunk.
- **Tasks**:
  1. Prompt returns strict JSON: `{ "cases": [ { "caseKey", "title", "summary", "status", "scopeHint", "confidence" } ] }`.
  2. Reuse `GeminiService` (`responseMimeType: application/json`, `temperature: 0`).
- **Acceptance**: Golden tests with stubbed `fetch` / client (no real API in CI).

---

**R2.3 [TEST] — `CaseLifecycleService`: deterministic identity across days**
- **Objective**: Same physical issue across multiple files/days maps to **one** `cases.id`.
- **Tasks**:
  1. `caseKey = normalize(scopeBucket + primarySignal + titleFingerprint)` (document exact formula in tests).
  2. Tests: day-2 email + day-5 email with same key → **update** same row (summary/status evolution), not insert duplicate.
  3. Tests: different keys → distinct rows.
  4. **Auto-close rule (POC)**: When a case is `open`/`in_progress` and a newly ingested fact satisfies a **declared closure predicate** for that `caseKey` (example predicates: `resolution_confirmed`, `invoice_paid`, `repair_completed`), transition status to `resolved` (or `closed` if you prefer terminal state) and bump `updatedAt`.
  5. Tests: ingest “closing fact” in a later day → same `cases.id` ends in terminal status without manual UI.
- **Acceptance**: Full-dataset simulation test builds N unique keys from a directory listing fixture (or snapshot subset), asserts no duplicate `caseKey` rows.

---

**R2.4 — Persist cases: upsert + timestamps + owner**
- **Objective**: Write to `cases` table with idempotent upsert.
- **Tasks**:
  1. `upsertCaseByKey` using `caseKey` unique index (add migration if missing) or deterministic UUID v5 from `caseKey`.
  2. Owner: default `user-1` (or first seed user) with override hook for demos.
  3. `updatedAt` always bumps on merge; `createdAt` stable.
- **Acceptance**: Integration test inserts then updates same case across two synthetic “days”.

---

**R2.5 — Link facts to cases (`fact_cases`)**
- **Objective**: When a fact is clearly evidence for a case, attach it.
- **Tasks**:
  1. Heuristic v1: same ingestion batch + overlapping `caseKey` signal in fact key/value → link.
  2. Avoid duplicate `(factId, caseId)` pairs (respect PK).
- **Acceptance**: Query `fact_cases` returns expected links in integration test.

---

**R2.6 — Wire into history + baseline paths**
- **Objective**: Cases appear during `dryRunHistory` (live) and optionally mock dry-run with **one** highlighted case.
- **Tasks**:
  1. After facts for a file are persisted, run `CaseExtractor` → `CaseLifecycleService` → DB.
  2. **Mock dry-run**: config cap `MAX_CASES_PER_RUN=1` (or hardcode demo case key) so output stays readable; **live/history**: no cap (full dataset).
  3. Extend per-day summary JSON: `casesOpened`, `casesUpdated`, `casesResolved` (counters).
  4. Ensure **auto-close evaluation runs after facts are persisted** for the day/file batch so closure facts never get “skipped” because case processing happened too early.
- **Acceptance**: `make run-history-mock` shows ≥1 case movement for demo; live run processes all `.eml`/`.pdf` without artificial case limit.

---

**R2.7 [TEST] — End-to-end “full dataset” case integrity**
- **Objective**: Prove scale behavior for POC, not just happy path.
- **Tasks**:
  1. Integration test: replay **two** synthetic day folders with 5+ files, assert case cardinality bounds (e.g. no duplicate `caseKey`, bounded orphan cases).
  2. Optional: snapshot `cases` count upper bound vs files ingested (document ratio in test name).
- **Acceptance**: Test documents assumptions; fails if duplicate case rows appear for same `caseKey`.

---

**R2.8 — Case conflict / merge policy (minimal)**
- **Objective**: If two intents collide on same `caseKey` with incompatible titles, merge deterministically (prefer higher confidence, append summary bullet).
- **Tasks**:
  1. Unit tests for merge rules.
  2. If merge introduces a “closure signal” (per R2.3 predicates), apply the same auto-close transition rules deterministically.
- **Acceptance**: No silent data loss; merged result always traceable in `summary` text.

### Epic R3: LLM Reliability and Cost Control Hardening
*Goal: Avoid duplicate calls and improve demo reliability under quota pressure.*

- **R3.1 [TEST]**: Add failing tests for source-hash cache behavior (same file rerun must skip LLM call).
- **R3.2**: Implement cache store keyed by `sourceHash + model + promptVersion` for Gatekeeper/Extractor/CaseExtractor.
- **R3.3 [TEST]**: Add tests for cache invalidation when file content changes.
- **R3.4**: Extend diagnose script output to include cache hit/miss and recommended model pairing for demo runs.

### Epic 4 (Legacy Epic 4): MCP + Semantic Retrieval + Agentic Case Assist
*Goal: Make MCP + semantic retrieval reliable and useful for automated case assistance in the demo.*

> [!NOTE]
> Feedback integrated: semantic search API + MCP + frontend page are already in place, and stack moved to Postgres/pgvector.
> Epic 4 now focuses on productionizing that path for the POC demo and agent workflows.

- **E4.1 [TEST] Semantic Retrieval Quality Gates**
  - Add dataset-backed tests for top-k relevance over facts/cases with scoped filters (`propertyId`, `houseId`, `apartmentId`).
  - Define minimum acceptance thresholds (e.g., expected entity appears in top-3 for canonical prompts).

- **E4.2 MCP Tool Contract Stabilization**
  - Define and lock MCP tool schemas for:
    1. `semantic_search`
    2. `get_related_cases`
    3. `get_related_facts`
    4. `get_case_context_bundle` (single-call case context for agents)
  - Add integration tests for schema and error handling.

- **E4.3 Embedding/Index Freshness**
  - Ensure new/updated facts and cases are embedded/indexed deterministically after ingestion.
  - Add replay tests asserting no stale semantic results after updates/auto-close transitions.

- **E4.4 Agent-Assist Loop (POC Safe)**
  - Implement an orchestrated step (ai-sdk + MCP tools) that:
    1. receives a new/updated case
    2. retrieves related cases/facts via MCP semantic search
    3. returns a concise structured recommendation bundle
  - Keep case state mutation guarded (no blind auto-close from agent output).

- **E4.5 Guarded Agent Actions**
  - If agent proposes `close case`, require explicit rule satisfaction:
    - closure predicate evidence present in DB
    - scope alignment check
    - confidence threshold met
  - Persist action trace (`why closed`, evidence IDs, prompt/tool context summary).

- **E4.6 [TEST] End-to-End MCP Agent Workflow**
  - Add integration test:
    1. ingest day file
    2. open/resolve case
    3. run MCP-based related search
    4. validate response bundle quality + guardrail enforcement.

- **E4.7 Demo Path Script**
  - Add one deterministic command for judges:
    - run history replay
    - execute semantic query examples
    - show one agent-assist recommendation output with evidence trace.

### Epic R4: Day-01 to Day-10 History Replay
*Goal: Build the timeline engine required for the demo story.*

- **R4.1 [TEST]**: Add failing integration test for chronological replay from `HistoryPopulationData/day-01` to `day-10`.
- **R4.2**: Implement `PropertyHistoryRunner` orchestrator for day-folder ingestion sequence.
- **R4.3 [TEST]**: Add tests for idempotent rerun behavior (same day replay does not duplicate facts/cases/events).
- **R4.4**: Implement `ingestion_events`/history persistence model (day, file, action, entity type/id, before/after fingerprints).
- **R4.5**: Produce per-day summary artifacts for demo (`created_facts`, `updated_facts`, `opened_cases`, `resolved_cases`, conflicts).

### Epic R5: Demo Surface and Verification (Current Focus)
*Goal: Make the judge/demo experience deterministic, fast, and traceable with one-command execution and clear outputs.*

- **R5.1 [TEST] Judge Demo Script Contract**
  - Add failing integration tests for a single entrypoint script that:
    1. prepares or validates DB readiness,
    2. replays history,
    3. runs canonical MCP/semantic queries,
    4. executes guarded case assist scenario,
    5. prints a structured summary block.
  - Acceptance: test asserts required sections/keys exist in output.

- **R5.2 Deterministic One-Command Run**
  - Implement/standardize `make run-demo-history` (or equivalent) as canonical demo command.
  - Ensure deterministic mode defaults:
    - stable mock embedding path for CI/demo fallback,
    - predictable case cap behavior in mock mode,
    - explicit mode banner (`mock`/`live`).
  - Acceptance: command succeeds on clean machine using documented setup path.

- **R5.3 Demo Summary + Trace Bundle**
  - Persist and print a concise summary artifact after demo run:
    - facts inserted/blocked/idempotent,
    - cases opened/updated/resolved,
    - guardrail decisions (approved/rejected),
    - top semantic query hits,
    - conflict/trace artifact paths.
  - Acceptance: summary can be shown directly to judges without log digging.

- **R5.4 Read-Only Operator Snapshot (POC Minimal)**
  - Build or polish a lightweight read-only visualization for:
    - timeline/day counters,
    - open vs resolved cases,
    - latest guarded closure traces.
  - Keep edit flows out-of-scope.
  - Acceptance: route/component is stable for demo and covered by frontend tests.

- **R5.5 [TEST] Failure-Mode UX**
  - Add tests for common demo failure states:
    - missing env/model config,
    - DB unavailable,
    - MCP tool call failure.
  - Ensure script outputs actionable remediation hints (not stack dumps only).
  - Acceptance: each failure mode returns non-zero exit and human-readable next action.

- **R5.6 Final Demo Hardening Checklist**
  - Automate and document pre-demo checks:
    - `pnpm test`
    - `pnpm lint`
    - baseline + history dry-runs
    - judge demo command
  - Acceptance: checklist command exits green and is included in README/plan.

## 5. Ticket Execution Order (Do This Next)

1. **Week Slice A (foundation fix)**: R1.1 -> R1.5
2. **Week Slice B (cases)**: R2.0 -> R2.8 (implemented; maintain only)
3. **Week Slice C (semantic + MCP hardening)**: E4.1 -> E4.7 (implemented on main; verify and maintain)
4. **Week Slice D (demo polish + reliability)**: R5.1 -> R5.6, then selective R4/R3 gaps

If time is constrained, prioritize R5.1, R5.2, R5.3, and R5.5 for demo safety.

## 8. Handover Status (For Other Agents)

1. Epic R1 and R2 are implemented; treat them as stable baseline (do not restart).
2. Epic 4 has been merged to main; maintain/fix incrementally only.
3. This branch is for **Epic R5** execution.
4. First delivery target: deterministic judge command + structured summary + failure-mode messaging.
5. Keep all guardrails (gold protection, closure guardrails, temperature 0) intact.

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
