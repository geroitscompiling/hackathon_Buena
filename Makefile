.PHONY: help install db-start db-stop db-reset db-setup db-backup db-restore run-initial run-initial-live run-initial-mock run-history run-history-live run-history-mock run-stage-live run-demo-history run-demo-judge-history-mcp-assist pre-demo-check diagnose dev test lint check

DATABASE_URL ?= postgres://postgres:postgres@localhost:5433/buena

help:
	@echo "Available commands:"
	@echo "  make install      - install dependencies"
	@echo "  make db-start     - start local Postgres + pgvector"
	@echo "  make db-stop      - stop local Postgres + pgvector"
	@echo "  make db-reset     - reset local Postgres volume data"
	@echo "  make db-setup     - push schema and seed clean db"
	@echo "  make db-backup    - snapshot Postgres (custom format, .db-backups/)"
	@echo "  make db-restore   - restore from RESTORE_FILE=... (see target help)"
	@echo "  make run-initial  - reset db and run baseline dry-run (live AI)"
	@echo "  make run-initial-live - run baseline dry-run with live AI (optionally FILE_LIMIT=1)"
	@echo "  make run-initial-mock - run baseline dry-run with deterministic mocks (optionally FILE_LIMIT=1)"
	@echo "  make run-history  - replay day-01 to day-10 (mock mode default, deterministic)"
	@echo "  make run-history-live - replay day-01 to day-10 with live AI + MCP (optionally DAY=day-03)"
	@echo "  make run-history-mock - replay day-01 to day-10 with deterministic mocks (optionally DAY=day-03)"
	@echo "  make run-stage-live - stage script: run-initial then run-history-live"
	@echo "  make run-demo-history - FAILOVER script (judgeDemoRunner: history + MCP + guarded assist)"
	@echo "  make run-demo-judge-history-mcp-assist - alias for run-demo-history (failover)"
	@echo "  make pre-demo-check - run tests, lint, baseline/history flows, and judge demo command"
	@echo "  make diagnose     - check Gemini models/probe quota signals"
	@echo "  make dev          - run app locally"
	@echo "  make test         - run test suite"
	@echo "  make lint         - run linter"
	@echo "  make check        - run biome check"

install:
	pnpm install

db-start:
	docker compose up -d --wait postgres

db-stop:
	docker compose down

db-reset:
	docker compose down -v
	docker compose up -d --wait postgres

db-setup: db-start
	docker compose exec -T postgres psql -U postgres -d buena -c "CREATE EXTENSION IF NOT EXISTS vector;"
	DATABASE_URL=$(DATABASE_URL) pnpm run db:push

# After a long baseline import, snapshot the DB so you can skip re-running LLM-heavy ingestion.
# Backup: creates .db-backups/buena-YYYYMMDD-HHMMSS.dump (Postgres custom format, includes pgvector).
DB_BACKUP_DIR ?= .db-backups
db-backup: db-start
	@mkdir -p $(DB_BACKUP_DIR)
	@OUT="$(DB_BACKUP_DIR)/buena-$$(date +%Y%m%d-%H%M%S).dump"; \
	echo "Writing $$OUT"; \
	docker compose exec -T postgres pg_dump -U postgres -d buena -Fc -f /tmp/buena-snapshot.dump && \
	docker compose cp postgres:/tmp/buena-snapshot.dump "$$OUT" && \
	echo "Done."

# Restore: use a clean database (e.g. make db-reset && make db-start) then:
#   make db-restore RESTORE_FILE=.db-backups/buena-YYYYMMDD-HHMMSS.dump
# Recreates schema + data from the snapshot; run db-setup first only if you need extensions on an empty volume.
db-restore: db-start
	@test -n "$(RESTORE_FILE)" || (echo "Usage: make db-restore RESTORE_FILE=.db-backups/buena-....dump"; exit 1)
	docker compose cp "$(RESTORE_FILE)" postgres:/tmp/buena-restore.dump
	docker compose exec -T postgres pg_restore -U postgres -d buena --clean --if-exists --no-owner /tmp/buena-restore.dump

run-initial-live: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) $(if $(FILE_LIMIT),BASELINE_FILE_LIMIT=$(FILE_LIMIT)) pnpm run dry-run:baseline

run-initial: run-initial-live

run-initial-mock: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) BASELINE_MODE=mock $(if $(FILE_LIMIT),BASELINE_FILE_LIMIT=$(FILE_LIMIT)) pnpm run dry-run:baseline

run-history: run-history-mock

run-history-live:
	DATABASE_URL=$(DATABASE_URL) HISTORY_MODE=live HISTORY_DAY=$(DAY) pnpm run dry-run:history

run-history-mock:
	DATABASE_URL=$(DATABASE_URL) HISTORY_MODE=mock HISTORY_DAY=$(DAY) pnpm run dry-run:history

run-stage-live: run-initial run-history-live

# Why this target exists:
# - Demo convenience only: one command for a clean, deterministic judge run.
# - It intentionally resets the DB, replays history, runs MCP queries, and prints guarded case-assist trace output.
# When to run:
# - Use this for a "from-zero" scripted demo.
# - Do NOT use this if you want to keep your current DB state after run-initial/run-history.
run-demo-history: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) HISTORY_MODE=$(or $(HISTORY_MODE),mock) pnpm run demo:judge-history-mcp-assist

run-demo-judge-history-mcp-assist: run-demo-history

pre-demo-check: db-setup
	pnpm test
	pnpm lint
	DATABASE_URL=$(DATABASE_URL) make run-initial-mock
	DATABASE_URL=$(DATABASE_URL) make run-history-mock
	DATABASE_URL=$(DATABASE_URL) HISTORY_MODE=mock make run-demo-history

diagnose:
	pnpm run gemini:diagnose

dev:
	pnpm dev

test:
	pnpm test

lint:
	pnpm lint

check:
	pnpm check
