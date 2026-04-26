# Buena Context-Loom: Forward Plan (Runner-First)

This is a clean forward-looking plan. Completed implementation history is intentionally removed.  
Keep this file focused on enduring constraints and next build steps only.

> [!IMPORTANT]
> **Execution Mode**: Test-first (`test -> fail -> implement -> pass`) and keep demo flows deterministic where possible.

## 1. Enduring Product Context

We are building a DB-first property intelligence app that:

1. Ingests mixed property inputs (ERP + unstructured docs).
2. Resolves facts/cases to hierarchy scope (`property`, `house`, `apartment`).
3. Preserves source traceability for every extracted decision.
4. Supports semantic retrieval and MCP access for agent workflows.
5. Demonstrates chronological evolution via `day-01`…`day-10` replay.

## 2. Non-Negotiable Constraints

1. **DB-first source of truth** (no markdown-as-primary fallback).
2. **Gold protection**: ERP-derived facts cannot be silently overwritten by AI output.
3. **Deterministic generation settings**: fact/case generation prompts run at `temperature: 0`.
4. **Scope integrity**: facts/cases must resolve to exactly one effective hierarchy scope.
5. **Replay requirement**: history replay across day folders remains a core demo mechanic.

## 3. Core Domain Reference (Keep Stable)

1. **Fact**: evidence atom with source linkage and confidence.
2. **Case**: operational workflow record (`title`, `summary`, `status`, `owner`, scope, lifecycle).
3. **Closure**: case can only close through explicit rule satisfaction and evidence checks.
4. **Agent assist**: advisory by default; state mutation remains guarded by rules.

## 4. Active Build Focus: Runner + Timeline Hardening

### Epic N0: Full Baseline Corpus + On-Demand Hierarchy (P0 — external feedback)

*Prioritised ahead of N1–N4. Addresses two gaps raised by external devs.*

| # | Original (DE) | Intent (EN) |
|---|----------------|-------------|
| 1 | *Baseline import liest noch nicht den ganzen Datenstamm; optional DB-Backup damit man das nicht wiederholen muss.* | **Initial / baseline run** should ingest the **full** seed corpus relevant to setup, not only gold CSV/JSON. Unstructured sources that feed **Gatekeeper** (e.g. invoices, older PDFs such as “2024” material in test data) must be included where the repo layout expects them. After a heavy full import, provide a **repeatable DB snapshot/backup** so teams do not redo the full load every time. |
| 2 | *Beim Owner-Import wird die Wohnung/das Haus noch nicht zugeordnet, weil Haus/Wohnung in der DB fehlt.* | **Facts must resolve to the correct house/apartment.** If ERP/owner import references units **before** `houses` / `apartments` rows exist, **create or link hierarchy nodes on demand** (idempotent upsert from stable keys/labels), then persist facts with correct scope. |

- **N0.1 [TEST] Baseline / initial path covers full corpus**
  - Inventory test-data / initial layout: which files are “core” (CSV/JSON) vs noisy (PDF/EML) for the **first** run.
  - Add failing tests that assert the baseline pipeline (or dedicated “full initial” mode) processes **all** intended files for setup—not only `JsonIngestor` / `CsvIngestor` paths.
  - Acceptance: Gatekeeper + extractors run on applicable unstructured files during initial import where product rules say they should; counts or fixture assertions prove coverage.

- **N0.2 DB snapshot after full import**
  - Document and/or automate a **backup** of Postgres after a successful full baseline (and document restore). Prefer `make` targets or scripts aligned with existing `db-setup` / Docker flow.
  - Acceptance: another dev can restore from artifact without re-running the entire LLM-heavy import.

- **N0.3 [TEST] On-demand hierarchy for owner / ERP facts**
  - When incoming facts carry house/apartment identifiers (or labels) that have **no** DB row yet, **upsert** `houses` / `apartments` (and relations) deterministically, then attach facts with correct `houseId` / `apartmentId` (or equivalent schema fields).
  - Acceptance: integration test where import order is “owner row before unit row exists” still yields correctly scoped facts; reruns remain idempotent.

- **N0.4 Wire initial run vs 10-day replay**
  - Clarify two scenarios in code and docs: **(A)** setup + full initial data state, **(B)** `day-01`…`day-10` replay. Ensure (A) does not silently skip unstructured batches that judges expect to see in the DB before history.

### Epic N1: Runner Normalization
*Goal: make the replay runner the canonical orchestration entrypoint for demo and verification.*

- **N1.1 [TEST] Runner Contract Test**
  - Define a strict contract for runner output payload (day summaries + totals + artifact pointers).
- **N1.2 Single Canonical Runner Path**
  - Ensure baseline/history/demo scripts share one orchestration layer where possible.
- **N1.3 Config Surface Cleanup**
  - Standardize mode/day/filter env flags and defaults; remove ambiguous script behavior.
- **N1.4 Runner Observability**
  - Add structured logs/events for each day/file stage.

### Epic N2: Timeline Event Model
*Goal: persist explicit replay events that can power UI, MCP, and audits.*

- **N2.1 [TEST] Ingestion Event Schema**
  - Add tests for `ingestion_events` model (day, file, action, entity, before/after fingerprints).
- **N2.2 Event Persistence Integration**
  - Persist events during replay without breaking existing flows.
- **N2.3 Replay Idempotency**
  - Re-running same day set should not produce duplicate effects/events.
- **N2.4 Event Query API**
  - Add query surface for event timelines by property/day/entity.

### Epic N3: Reliability + Cache Layer
*Goal: reduce duplicate AI calls and stabilize runtime under quota pressure.*

- **N3.1 [TEST] Source Hash Cache**
  - Cache key design across Gatekeeper/Extractor/CaseExtractor.
- **N3.2 Cache Read/Write Integration**
  - Integrate cache in runner path with transparent cache metrics.
- **N3.3 Cache Invalidation Rules**
  - Verify changed file content invalidates cached outputs.
- **N3.4 Runtime Diagnostics**
  - Extend diagnose tooling to include cache and model-path diagnostics.

### Epic N4: Demo Readout Polish (Read-Only)
*Goal: keep judge story clear without broad UI editing scope.*

- **N4.1 Snapshot Panel Refinement**
  - Keep read-only counters/traces concise and stable.
- **N4.2 Judge Summary Artifact Standard**
  - Lock artifact schema used in demo narration.
- **N4.3 Failure UX Consistency**
  - Ensure every critical failure returns actionable remediation text.

## 5. Execution Order

1. **Now (P0)**: **N0** — full baseline corpus + on-demand hierarchy (**N0.1 → N0.3** first; **N0.2** and **N0.4** in parallel once behaviour is clear).
2. **Next**: N1 (runner normalization).
3. **Then**: N2 (timeline events + idempotency).
4. **Then**: N3 (cache/reliability hardening).
5. **Finally**: N4 (readout polish).

If time is constrained, prioritize **N0.1 + N0.3**, then **N0.2**. Runner work (**N1.1**) follows once P0 data integrity is credible.

## 6. Handover Notes for Any Next Agent

1. Do not re-introduce completed epic history into this file.
2. Use this plan as forward backlog only.
3. **Start at Epic N0** until baseline coverage and hierarchy-on-demand are verified; runner polish builds on trustworthy data.
4. Keep guardrails intact while refactoring orchestration paths (gold protection, `temperature: 0`, guarded case actions).
5. Favor incremental integration with existing services over parallel rewrites.
