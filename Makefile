.PHONY: help install db-reset db-setup run-initial run-initial-live run-initial-mock run-history run-history-live run-history-mock diagnose dev test lint check

DATABASE_URL ?= local.db

help:
	@echo "Available commands:"
	@echo "  make install      - install dependencies"
	@echo "  make db-reset     - delete local SQLite files"
	@echo "  make db-setup     - push schema and seed clean db"
	@echo "  make run-initial  - reset db and run baseline dry-run (live AI)"
	@echo "  make run-initial-live - run baseline dry-run with live AI"
	@echo "  make run-initial-mock - run baseline dry-run with deterministic mocks"
	@echo "  make run-history  - replay day-01 to day-10 (mock mode default)"
	@echo "  make run-history-live - replay day-01 to day-10 with live AI (optionally DAY=day-03)"
	@echo "  make run-history-mock - replay day-01 to day-10 with deterministic mocks (optionally DAY=day-03)"
	@echo "  make diagnose     - check Gemini models/probe quota signals"
	@echo "  make dev          - run app locally"
	@echo "  make test         - run test suite"
	@echo "  make lint         - run linter"
	@echo "  make check        - run biome check"

install:
	pnpm install

db-reset:
	rm -f local.db local.db-shm local.db-wal

db-setup:
	DATABASE_URL=$(DATABASE_URL) pnpm run db:push
	DATABASE_URL=$(DATABASE_URL) pnpm run db:seed

run-initial-live: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) pnpm run dry-run:baseline

run-initial-mock: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) BASELINE_MODE=mock pnpm run dry-run:baseline

run-history: run-history-mock

run-history-live:
	HISTORY_MODE=live HISTORY_DAY=$(DAY) pnpm run dry-run:history

run-history-mock:
	HISTORY_MODE=mock HISTORY_DAY=$(DAY) pnpm run dry-run:history

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
