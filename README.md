# Buena Context-Loom (hackathon POC)

This repo is a **property intelligence POC**: it ingests ERP exports plus unstructured documents (emails, PDFs) from local fixtures, extracts **facts** with **Google Gemini** (with source traceability), and can **replay** a simulated 10-day timeline. The web app is a **TanStack Start** (React + Vite) UI on top of **Postgres + pgvector**.

## Landing page

Hosted landing page: https://buena-home-hero.lovable.app/

## Prerequisites

- **Node.js** and **pnpm**
- **Docker** (for local Postgres with pgvector)
- A **Gemini API key** (`GEMINI_API_KEY`)

## First-time setup

1. Copy environment defaults and add your key:

   ```bash
   cp .env.example .env
   ```

   Set at least `GEMINI_API_KEY`. Other variables are documented in `.env.example`.

2. Install dependencies and prepare the database:

   ```bash
   make install
   make db-setup
   ```

   `db-setup` starts Postgres (`docker compose`), enables `vector`, and runs `pnpm run db:push`.

## Run the POC (Makefile)

| Command | What it does |
|--------|----------------|
| `make run-initial` | Resets DB, then **baseline** ingest: ERP gold data under `testfiles/stammdaten` plus unstructured files under `testfiles/emails` and `testfiles/rechnungen` (live AI). |
| `make run-initial-live` | Baseline only **without** the full `run-initial` reset; use `FILE_LIMIT=1` for a quick smoke test. |
| `make run-initial-mock` | Baseline with **deterministic mocks** (no Gemini calls). |
| `make run-history` | Replays `testfiles/HistoryPopulationData/day-01` … `day-10` in **mock** mode (deterministic). Add `DAY=day-03` to limit to one day. |
| `make run-history-live` | Same replay with **live AI** and MCP-oriented flow. |
| `make run-stage-live` | Runs `run-initial` then `run-history-live` (full staged demo). |
| `make run-demo-history` | Failover / judge demo runner (see `make help`). |
| `make diagnose` | Checks Gemini model reachability and quota-style errors (`429`, `Retry-After`). |
| `make help` | Lists all targets. |

**Baseline vs history:** Baseline builds the **initial** corpus from `stammdaten` + emails + invoices (excluding `HistoryPopulationData`). The **day-01…day-10** folders are for **incremental replay** after that—run history when you want that timeline populated.

### Database snapshots

After a long baseline import, avoid re-running heavy LLM work:

```bash
make db-backup
make db-restore RESTORE_FILE=.db-backups/buena-....dump
```

Typical restore: `make db-reset`, `make db-start`, then `db-restore` (see `make help` for details).

## Web app

```bash
make dev
```

or `pnpm dev` — then open the local URL printed in the terminal.

## Tests and quality

```bash
pnpm test
pnpm lint
pnpm check
```

Example: baseline integration test only:

```bash
pnpm test src/engine/__tests__/baselineDryRun.test.ts
```

CI runs on push/PR via `.github/workflows/tests.yml`.

## AI / environment tuning

Common variables (see `.env.example`):

- `AI_INFERENCE_PROVIDER` — `gemini` or `pioneer`; defaults to `gemini`
- `GEMINI_API_KEY` — required for live Gemini generation and embeddings
- `GEMINI_MODEL_GATEKEEPER`, `GEMINI_MODEL_EXTRACTOR`, `GEMINI_MODEL_EMBEDDING` — Gemini model overrides
- `PIONEER_API_KEY` — required when `AI_INFERENCE_PROVIDER=pioneer`
- `PIONEER_MODEL_GATEKEEPER`, `PIONEER_MODEL_EXTRACTOR` — optional Pioneer model overrides; default to `Qwen/Qwen3-32B`
- `PIONEER_BASE_URL` — optional; defaults to `https://api.pioneer.ai/v1`
- `GEMINI_MAX_RETRIES`, `GEMINI_MIN_REQUEST_DELAY_MS` — rate limit / backoff for AI calls
- `GEMINI_DEBUG=1` — extra retry diagnostics

Pioneer AI by Fastino Labs is used through its OpenAI-compatible chat completions endpoint with `X-API-Key` authentication. It can capture inference data for adaptive finetuning on the Pioneer platform, so production extraction traces can become training signal for improved checkpoints. The baseline gatekeeper, fact extractor, and case extractor all run at `temperature: 0`.

## Extending baseline file roots

To ingest another top-level tree under `testfiles/` (e.g. scans), extend `BASELINE_UNSTRUCTURED_TOP_LEVEL_DIRS` in `src/engine/baseline/collectBaselineUnstructuredPaths.ts`.

## For AI assistants and contributors

Product goals, architecture guardrails, and coding standards (TDD for non-UI logic, stack conventions) live in **[agents.md](./agents.md)**.

## Stack (short)

TypeScript, TanStack Router/Start, Drizzle ORM, Tailwind + shadcn/ui, Vitest, Biome, Dockerized Postgres + pgvector, Google Gemini, Pioneer AI.
