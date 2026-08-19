# mpp-case-study-der-ausfall-implementation

## Overview

Case study "The Outage" for meinphysio+ (physiotherapy, two Berlin locations). A practitioner calls in sick at 07:40 with 14 appointments that day. This service gives the front desk a triage tool: who is rebooked, who is cancelled, who is informed and how. Brief: `docs/case-study/brief.md`. Analysis: `docs/case-study/analysis.md`. Data: `data/`.

## Start

Requirements: Docker with Compose. Nothing else.

```bash
docker compose up --build
```

This starts three services:

| Service | URL | What it does |
| --- | --- | --- |
| `db` | `localhost:5432` | PostgreSQL 17 (user / password / database: `ausfall`) |
| `api` | <http://localhost:4000> | Runs migrations, seeds master data from `data/`, ingests the 08:00 Termino export, then serves the API. OpenAPI UI at <http://localhost:4000/docs>, health at `/healthz` |
| `web` | <http://localhost:3000> | Front-desk app (German UI, "Demo-Zeit" badge shows the simulated clock) |

The app believes it is **Monday 2026-09-07, 07:40 Europe/Berlin** (`APP_NOW`), so "imminent" and "today" mean what the case study means. Set `APP_NOW=system` on the `api` service for the real clock.

Walk-through: open <http://localhost:3000> → **+ Neuer Ausfall** → Anna Weber, krank, 07:40–18:00 → the assistant runs → open the urgent cases → work the queue. Then `POST /exports/ingest` with the 08:05 file (button in the app or `curl -X POST localhost:4000/exports/ingest -H 'content-type: application/json' -d '{"path":"termino_export_2026-09-07_0805.json"}'`) to see reconciliation.

If port 5432 is taken by a local PostgreSQL, stop it or change the published port of `db` in `docker-compose.yml` (the services talk to each other over the compose network, not the published port).

Local development without Docker for api/web: `pnpm install`, start only the database (`docker compose up -d db`), then `pnpm --filter @ausfall/api start` and `pnpm --filter @ausfall/web dev`. Tests: `pnpm test` (domain + api), `pnpm typecheck`.

## Status (end of the 3-hour time box, 2026-08-19)

Done:

- Domain engine with 62 tests (`packages/domain`): affected appointments, slot finder, auto-rebook policy as data, resolution engine, prescription warnings, ranking.
- Database schema with `tenant_id` everywhere, seed, idempotent export ingest with data-issue detection (`packages/db`).
- Explicit API with OpenAPI (`apps/api`): absences, reschedule tasks, quick actions, export ingest with reconciliation (protect local writes, confirm per write type, staleness flag), data issues. Fake Termino client and notifier behind an outbox.
- Web app (`apps/web`) on TanStack Start + shadcn/ui, German default locale: one queue of open cases across all absences, new-absence dialog that runs the assistant, case sheet with quick actions, absences overview.
- `docker compose up`, ADRs, glossary, analysis, prototypes (`docs/prototypes/`).

Open: see **Next steps** below and `ARCHITECTURE.md` §5. The biggest gaps are a real outbox worker (retries, circuit breaker), real Termino and notification adapters, and patient confirm/decline links.

## Assumptions

Things we take as true without proof. Update when an assumption is confirmed or broken.

- The first UI language is German. English support comes later, so the app is built i18n-ready from the start.
- Termino has a write path (decided 2026-08-19). All writes go through one `TerminoClient` adapter; for the case it is a fake that records writes locally. Writes are applied optimistically and confirmed by the next export, which lags by up to 5 minutes.
- All times are stored in UTC and shown in Europe/Berlin. Export timestamps are UTC (`Z`); the export file names carry Berlin local time.
- Prescription rules (28-day start deadline, interruption limits, frequency) are shown as warnings, never enforced.
- Fuzzy patient matches (Termino patient vs our master data) are suggested and confirmed by a human.
- Clean cases are resolved automatically: rebook in Termino + notify the patient by email/SMS through a `Notifier` adapter (fake outbox for the case). A front-desk phone call is the last resort.
- Auto-rebooking needs: practitioner qualifications cover the service, same location, start within ±2 days (same day preferred; the window is a guess and one config value), free gap ≥ duration, patient contactable. Anything else is a proposal for the front desk.
- When same-day coverage is certainly impossible, a cancellation notice for today goes out immediately; the rebooking follows (auto within ±2 days, else front-desk call).
- Location switch (Mitte ↔ Kreuzberg) is a last resort: shown with a warning, never automatic.
- Imminent appointments (past or < 30 min away) are never cancelled outright: offer a same-time practitioner swap if one is free, else the front desk handles the walk-in.
- A patient unknown to our master data (only in Termino) is treated as a self-payer and kept in play, and surfaced as a data gap.
- Unknown practitioner IDs in exports (`prac_03`) are surfaced to the front desk to handle, not ignored.

## Explicitly left out

Things we decided not to build, and why.

- Authentication, user management, deployment, CI, full test coverage, full error handling — the brief says they are not expected.
- Real email/SMS delivery and a real Termino API client. Both exist as adapters with fake implementations (outbox table, recorded writes) so the flow is visible in the UI; swapping in real providers is future work.
- Patient confirm/decline links in notifications. The message names the front desk number to decline; a real deployment needs a proper consent flow.

## Next steps

What should be done next, in priority order.

_Where we are (2026-08-19, end of the time box):_

- Done: domain engine with tests (`packages/domain`, 62 tests), DB schema + seed + idempotent export ingest with data-issue detection (`packages/db`), explicit API with OpenAPI (`apps/api`: absences, reschedule tasks, quick actions, ingest + reconciliation, data issues), fake Termino client + fake notifier behind an outbox, web shell on TanStack Start + shadcn/ui with mock data (`apps/web`), `docker compose up` for db + api.
- Stopped at: wiring the web app to the API. The UI flow was re-designed during the build (see `docs/prototypes/cockpit-flows.html`: one queue of open cases across all absences, plus "new absence" as a modal); the web shell still shows the first single-absence layout with mock data.

1. Wire `apps/web` to the API following the two-flow prototype (queue across absences, absence modal, side drawer); add `web` to docker compose.
2. ~~Reconciliation: confirm Termino writes against later exports and protect locally written rows from stale exports (ADR-0001).~~ Done: locally written appointments are protected from stale exports; writes are confirmed per type (cancel / swap / rebook with retirement of the local row) and flagged stale after two exports without evidence. Remaining: surface `writesUnconfirmed` and staleness in the UI.
3. Outbox worker with retries/backoff and circuit breaker (ADR-0001 consequences); today the fake adapters deliver synchronously.
4. Server-side i18n for free text that reaches the UI (warning details, data-issue details) — today English keys/params are needed; the strings are English inside a German UI.
5. `rebooked_manually` quick action with a slot picker; undo flow in the UI; data-issue resolution dialogs (match patient, mark practitioner departed).
6. Service-level tests for `absence-service` (the rules are covered in `packages/domain`; the orchestration was verified against the seeded DB only).

## Library choices

Each library we add, and why we chose it over the alternatives. Stack constraints from the brief: TypeScript, PostgreSQL, React.

| Library | Purpose | Why this one | Alternatives considered |
| ------- | ------- | ------------ | ----------------------- |
| pnpm workspaces | Monorepo: `apps/api`, `apps/web`, `packages/domain`, `packages/db`, `packages/contracts` | Keeps the domain engine a pure package that tests without a database or server; strict, fast installs | Single app (engine not testable in isolation), Turborepo (not needed at this size) |
| Hono + `@hono/node-server` + `@hono/zod-openapi` | Explicit HTTP API (ADR-0002) | Small, typed routes from zod contracts, OpenAPI document for free, runs on Node 24 | tRPC (TS-only consumers; we expect a tablet app and MCP agents), Fastify + ts-rest (more ceremony), NestJS (heavy for 3 h) |
| zod | Contracts shared by API and web, input validation | One schema is the API contract, the validator, and the TypeScript type | valibot (smaller, less ecosystem) |
| Drizzle ORM + drizzle-kit + postgres-js | Schema, migrations, queries | SQL-near, fully typed, fast cold start in Docker, migrations as plain SQL | Prisma (heavier runtime, slower start), Kysely (no migration story) |
| TanStack Start + TanStack Router | Web app (React 19) | Type-safe routing and data loading, SSR-capable, Vite under the hood; product owner preference | Vite SPA (no routing/data conventions), Next.js (SSR not needed, more Docker moving parts) |
| shadcn/ui + Tailwind v4 | UI components | Accessible primitives (Radix), owned in-repo, no custom components where a shadcn one fits; product owner preference | MUI, Chakra (heavier, less ownership) |
| react-i18next + i18next | i18n, `de` default, `en` stub | Mature, key-based, plural/format support | Lingui (extraction step), FormatJS (more setup) |
| date-fns + Europe/Berlin via `Intl` | UTC storage, Berlin display, day math | Small and explicit; the 08:00 Berlin = 06:00Z trap needs explicit conversion everywhere | Temporal (still polyfill), luxon |
| Vitest | Tests (TDD on `packages/domain`) | Fast, ESM-native, same config style as Vite | Jest |
| Node 24 (Active LTS) + Docker compose (`postgres:17`) | Runtime and one-command start | Current LTS; `docker compose up` brings db, api, web | Bun (less boring) |

## Related docs

- `CONTEXT.md` — glossary / ubiquitous language (German term → English term → explanation); the only place German appears
- `ARCHITECTURE.md` — how to scale to a tenant-based 100+ practice system
- `CONSTITUTION.md` — minimum requirements every change must meet
- `IMPLEMENTATION_NOTES.md` — findings, edge cases, decisions, deviations
- `CLAUDE.md` — agent instructions
