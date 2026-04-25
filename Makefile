.PHONY: help install db-reset db-setup run-initial run-history diagnose dev test lint check

DATABASE_URL ?= local.db

help:
	@echo "Available commands:"
	@echo "  make install      - install dependencies"
	@echo "  make db-reset     - delete local SQLite files"
	@echo "  make db-setup     - push schema and seed clean db"
	@echo "  make run-initial  - reset db and run baseline dry-run"
	@echo "  make run-history  - placeholder for history replay epic"
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

run-initial: db-reset db-setup
	DATABASE_URL=$(DATABASE_URL) pnpm run dry-run:baseline

run-history:
	pnpm run dry-run:history

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
