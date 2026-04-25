# Buena Context-Loom: Agent System Context

**Welcome, AI Agent!** If you are reading this, you are assisting with the Buena Context-Loom Hackathon project. This document defines our goals, architectural rules, and strict coding standards. You MUST adhere to these rules at all times. **Before starting, you MUST also read the [README.md](file:///Users/gerograms/workspace/hackathon/README.md) for technical setup and environment details.**

## 🎯 The Mission
We are building a highly polished, AI-native Property Management App. 
The engine consolidates scattered property data (ERP exports, emails, scanned PDFs) into a decentralized, Git-backed **"Golden Folder"** of categorized Markdown files per property (e.g., `overview.md`, `repairs.md`), complete with traceability, AI query capabilities, and a conflict resolution interface.

Our USP (Unique Selling Proposition) for the hackathon:
- **Traceability**: Every fact extracted must map back to its source file (e.g., `stammdaten.json`, `LTR-0001.pdf`).
- **Surgical Updates**: AI edits specific sections of the Markdown file without destroying human annotations.
- **Git Failover**: Every automated update commits to a local Git repository, creating a bulletproof history and timeline.

## 🏛️ Core Architectural Rules
1. **The Property Runner & Folder Structure**: Orchestrates a 10-Day simulation cycle feeding files (`day-01` to `day-10`) into the engine. It creates a dedicated folder structure (`properties/LIE-001/`) containing category-specific Markdown files, and generates the Git history across the entire folder.
2. **ERP is "Gold" (Read-Only)**: Facts derived from core ERP exports (`stammdaten.json`, `eigentuemer.csv`) are immutable "gold standards" (`isGoldStandard: true`). AI extracted facts from emails/PDFs can NEVER silently overwrite them.
3. **Webhook Mocking**: We do not build live API webhooks. We strictly use FileType ingestors (`JsonIngestor`, `PdfIngestor`, `EmlIngestor`) pointing to local testfiles to simulate the event streams.
4. **Human-Over-AI Interface**: Humans can freely overwrite AI edits in the UI, but receive a simple warning message before saving.
5. **Zero Hallucination Tolerance**: All LLM calls generating facts MUST run at `temperature: 0`.

## 💻 Code Style & Engineering Principles (CRITICAL)

The primary developer strictly enforces high-quality software engineering:

1. **Test-Driven Development (TDD) First!**
   - **Rule**: NEVER write or modify application logic without writing the test first.
   - **Workflow**: Write the test -> Run the test (it must fail to reflect the missing feature/bug) -> Write the logic -> Run the test (it must pass).
   - **Bugfixes**: If fixing a bug, write a test that exposes the bug first, then fix the code.
   - **Framework**: We use `vitest` for all testing.

2. **SOLID Principles**
   - **Single Responsibility**: Keep classes small. E.g., `PdfIngestor` parses PDFs, `SectionPatcher` updates Markdown. They do not mix.
   - **Open/Closed**: Design interfaces (like `Ingestor`) so we can add new file types without changing the core runner.
   - **Dependency Inversion**: Rely on abstractions (interfaces/types), not concretions.

3. **Tech Stack & Conventions**
   - **Language**: TypeScript (strict mode).
   - **Framework**: Vite + React + TanStack Start (Router).
   - **Database**: `better-sqlite3` + Drizzle ORM (for local `SourceRegistry` and facts).
   - **Styling**: Tailwind CSS + shadcn/ui.
   - **AI Provider**: Google Gemini (via `GEMINI_API_KEY` in `.env`).

4. **Formatting**
   - Use clean, descriptive naming conventions.
   - Keep files small and modular.
   - Document complex logic with JSDoc comments.

*Note: Always cross-reference the `IMPLEMENTATION_PLAN.md` for specific Epic and Ticket details.*
