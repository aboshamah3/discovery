# CLAUDE.md — DS Product Discovery

Guidance for AI coding agents working in this repository. The binding rules live in
[`.specify/memory/constitution.md`](./.specify/memory/constitution.md) and the build order in
[`DS_PROJECT_SPEC_PLAN.md`](./DS_PROJECT_SPEC_PLAN.md); this file is the quick orientation.

## What this is

A fast, one-page product discovery/search experience built **backend-first**: import a JSON catalog
into PostgreSQL, index it into Typesense, expose clean API endpoints, and only then build the frontend.
Work proceeds as ordered Spec Kit specs under [`specs/`](./specs).

## Stack

- **App:** Next.js 15 (App Router) + TypeScript (strict), React 19
- **Monorepo:** pnpm 9 workspaces (`apps/*`, `packages/*`)
- **Database:** PostgreSQL 16 (source of truth) — direct access via `pg`, **no ORM**; plain SQL migrations
- **Search:** Typesense 27 (rebuildable index) via `@ds/search`
- **Validation:** Zod at every untrusted boundary
- **Tests:** Vitest · **Lint:** ESLint 9 (flat config) · **Deploy:** Railway

## Core conventions (from the constitution — follow these)

1. **Spec-driven, frontend-last.** No product UI before Spec 007; earlier specs ship backend/data/search
   only, keeping the home route a placeholder. Each spec is an independently testable increment.
2. **PostgreSQL is the source of truth; Typesense is a rebuildable index.** Every search document must be
   reconstructable from Postgres; a reindex rebuilds from scratch.
3. **Idempotent, script-first pipelines.** Import/reindex/migrate live as committed scripts under
   `scripts/` (thin CLIs) with logic in `packages/*`; idempotent, bounded batches, fail loudly.
4. **Contract-first, validated boundaries.** Every endpoint has a documented contract; validate all
   external input with Zod before use; keep response shapes stable.
5. **Secrets & scope discipline.** Config via env only; never commit real secrets (only `.env.example`).
   The Typesense **admin** key is server-side only — never `NEXT_PUBLIC_*`. No auth/cart/checkout/admin/
   multi-tenancy unless a spec explicitly requires it (YAGNI).
6. **Non-negotiable quality gates.** `pnpm lint && pnpm typecheck && pnpm test` must be green before a
   spec is done; tests must pass with no running database or search engine.

## Spec Kit workflow

Each spec runs: **specify → (clarify) → plan → tasks → (analyze) → implement**, with review gates.
Commands are defined under `.github/prompts/` + `.github/agents/` (copilot integration). Artifacts per
spec: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`,
`checklists/`. The active feature is tracked in `.specify/feature.json`.

## Common commands

```bash
pnpm install
cp .env.example .env
docker compose up -d          # local Postgres (5432) + Typesense (8108)
pnpm db:migrate               # apply pending SQL migrations (idempotent)
pnpm import:products          # fetch → validate → upsert catalog into Postgres
pnpm reindex:products         # rebuild the Typesense index from Postgres
pnpm dev                      # http://localhost:3000
pnpm build                    # standalone production build (+ static copy) — see Deployment
pnpm lint && pnpm typecheck && pnpm test
```

Deployment (Railway) is documented in [`README.md`](./README.md#deployment--railway-spec-006) and
[`specs/006-railway-deployment/`](./specs/006-railway-deployment).

## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a
tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return
structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what
is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log
messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture / trace
  questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore`
  for the source of the symbols it surfaces. Codegraph IS the pre-built index, so spawning a separate
  file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster.
- **Don't chain `codegraph_search` + `codegraph_node`** when you want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` returns several symbols' source in one capped call.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph
initialized. Want me to run `codegraph init -i` to build the index?"*
