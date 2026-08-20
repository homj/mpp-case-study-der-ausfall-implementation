# mpp-case-study-der-ausfall-implementation

Case study "The Outage" for meinphysio+ (physiotherapy, two Berlin locations). A practitioner calls in sick at 07:40 with 14 appointments that day. This service gives the front desk a triage tool: who is rebooked, who is cancelled, who is informed, and how.

- Brief: `docs/case-study/brief.md`
- Analysis: `docs/case-study/analysis.md`
- Data: `data/`
- How it scales to 100+ practices: `ARCHITECTURE.md`

## Quick start

You need Docker with Compose. Nothing else.

```bash
docker compose up --build
```

| Service | URL | What it does |
| --- | --- | --- |
| `db` | `localhost:5432` | PostgreSQL 17 (user / password / database: `ausfall`) |
| `api` | <http://localhost:4000> | Runs migrations, seeds master data from `data/`, ingests the 08:00 Termino export, then serves the API. OpenAPI UI at [/docs](http://localhost:4000/docs), health at `/healthz` |
| `web` | <http://localhost:3000> | Front-desk app (German UI; the "Demo-Zeit" badge shows the simulated clock) |

The app believes it is **Monday 2026-09-07, 07:40 Europe/Berlin** (`APP_NOW`). This makes "imminent" and "today" mean what the case study means. Set `APP_NOW=system` on the `api` service to use the real clock.

**Walk-through:**

1. Open <http://localhost:3000>.
2. Click **+ Neuer Ausfall**: Anna Weber, krank, 07:40–18:00. The assistant runs.
3. Open the urgent cases and work the queue.
4. Ingest the 08:05 export to see reconciliation: use the button in the app, or `POST /exports/ingest` with `{"path":"termino_export_2026-09-07_0805.json"}`.

If port 5432 is taken by a local PostgreSQL, stop it or change the published port of `db` in `docker-compose.yml`. The services talk over the compose network, not the published port.

**Local development without Docker** (api/web only): `pnpm install`, start the database with `docker compose up -d db`, then `pnpm --filter @ausfall/api start` and `pnpm --filter @ausfall/web dev`. Tests: `pnpm test` (domain + api). Types: `pnpm typecheck`.

## Status (end of the 3-hour time box, 2026-08-19)

Done:

- **Domain engine** (`packages/domain`, 62 tests): affected appointments, slot finder, auto-rebook policy as data, resolution engine, prescription warnings, ranking.
- **Database** (`packages/db`): schema with `tenant_id` on every table, seed, idempotent export ingest with data-issue detection.
- **API** (`apps/api`, Hono + OpenAPI): absences, the ranked task queue, quick actions, export ingest with reconciliation (protect local writes, confirm per write type, flag stale writes), data issues. Fake Termino client and notifier behind an outbox.
- **Web app** (`apps/web`, TanStack Start + shadcn/ui, German default locale): one queue of open cases across all absences, new-absence dialog that runs the assistant, case sheet with quick actions, absences overview, ingest button.
- `docker compose up`, ADRs, glossary, analysis, prototypes (`docs/prototypes/`).

Not done: the API already serves undo, data issues, and the outbox, but the UI does not show them yet. See **Next steps**.

## Assumptions

Things we take as true without proof. Update this list when an assumption is confirmed or broken.

- The first UI language is German. English comes later, so the app is i18n-ready from the start.
- Termino has a write path (decided 2026-08-19). All writes go through one `TerminoClient` adapter; the case uses a fake that records writes locally. Writes are applied optimistically and confirmed by the next export, which lags by up to 5 minutes.
- All times are stored in UTC and shown in Europe/Berlin. Export timestamps are UTC (`Z`); the export file names carry Berlin local time.
- Prescription rules (28-day start deadline, interruption limits, frequency) are shown as warnings, never enforced.
- Fuzzy patient matches (Termino patient vs our master data) are suggested to a human, never auto-merged.
- Clean cases are resolved automatically: rebook in Termino, then notify the patient by email/SMS through a `Notifier` adapter (fake outbox for the case). A front-desk phone call is the last resort.
- Auto-rebooking requires: practitioner qualifications cover the service, same location, start within ±2 days (same day preferred; the window is a guess and one config value), a free gap ≥ duration, and a contactable patient. Anything else becomes a proposal for the front desk.
- When same-day coverage is certainly impossible, a cancellation notice for today goes out immediately. The rebooking follows: automatic within ±2 days, else a front-desk call.
- A location switch (Mitte ↔ Kreuzberg) is a last resort: shown with a warning, never automatic.
- Imminent appointments (past or < 30 min away) are never cancelled outright. Offer a same-time practitioner swap if one is free, else the front desk handles the walk-in.
- A patient unknown to our master data (only in Termino) is treated as a self-payer, kept in play, and surfaced as a data gap.
- Unknown practitioner IDs in exports (`prac_03`) are surfaced to the front desk, not ignored.

## Explicitly left out

Things we decided not to build, and why.

- **Authentication, user management, deployment, CI, full test coverage, full error handling** — the brief says they are not expected.
- **Real email/SMS delivery and a real Termino API client.** Both exist as adapters with fake implementations (outbox table, recorded writes), so the flow is visible in the UI. Swapping in real providers is future work.
- **Patient confirm/decline links in notifications.** The message names the front-desk number to decline. A real deployment needs a proper consent flow.

## Next steps

In priority order.

1. **Outbox worker** with retries, backoff, and a circuit breaker (ADR-0001 consequences). Today the fake adapters deliver synchronously in the request path.
2. **Finish the front-desk UI** against the existing API: undo of an automated action, the data-issues panel, the outbox panel, unconfirmed/stale write indicators, and the "all appointments of this patient" section in the case sheet.
3. **Server-side i18n for free text** that reaches the UI (warning details, data-issue details). Today these strings are English inside a German UI.
4. **`rebooked_manually` quick action** with a slot picker, and data-issue resolution dialogs (match patient, mark practitioner departed).
5. **Service-level tests for `absence-service`.** The rules are covered in `packages/domain`; the orchestration was verified against the seeded DB only.
6. **Real adapters and patient links**: real Termino client, real notification provider, confirm/decline links.

For the multi-tenant road map (tenant context, row-level security, per-tenant configuration), see `ARCHITECTURE.md` §3.

## Library choices

Stack constraints from the brief: TypeScript, PostgreSQL, React.

| Library | Purpose | Why this one | Alternatives considered |
| ------- | ------- | ------------ | ----------------------- |
| pnpm workspaces | Monorepo: `apps/api`, `apps/web`, `packages/domain`, `packages/db`, `packages/contracts` | Keeps the domain engine a pure package that tests without a database or server; strict, fast installs | Single app (engine not testable in isolation); Turborepo (not needed at this size) |
| Hono + `@hono/node-server` + `@hono/zod-openapi` | Explicit HTTP API (ADR-0002) | Small, typed routes from zod contracts, OpenAPI document for free, runs on Node 24 | tRPC (TS-only consumers; we expect a tablet app and MCP agents); Fastify + ts-rest (more ceremony); NestJS (heavy for 3 h) |
| zod | Contracts shared by API and web, input validation | One schema is the API contract, the validator, and the TypeScript type | valibot (smaller, less ecosystem) |
| Drizzle ORM + drizzle-kit + postgres-js | Schema, migrations, queries | SQL-near, fully typed, fast cold start in Docker, migrations as plain SQL | Prisma (heavier runtime, slower start); Kysely (no migration story) |
| TanStack Start + TanStack Router | Web app (React 19) | Type-safe routing and data loading, SSR-capable, Vite under the hood; product-owner preference | Vite SPA (no routing/data conventions); Next.js (SSR not needed, more Docker moving parts) |
| shadcn/ui + Tailwind v4 | UI components | Accessible primitives (Radix), owned in-repo; product-owner preference | MUI, Chakra (heavier, less ownership) |
| react-i18next + i18next | i18n: `de` default, `en` stub | Mature, key-based, plural and format support | Lingui (extraction step); FormatJS (more setup) |
| date-fns + `Intl` for Europe/Berlin | UTC storage, Berlin display, day math | Small and explicit; the 08:00 Berlin = 06:00Z trap needs explicit conversion everywhere | Temporal (still a polyfill); luxon |
| Vitest | Tests (TDD on `packages/domain`) | Fast, ESM-native, same config style as Vite | Jest |
| Node 24 (Active LTS) + Docker Compose (`postgres:17`) | Runtime and one-command start | Current LTS; `docker compose up` brings db, api, web | Bun (less boring) |

## Related docs

- `CONTEXT.md` — glossary (German term → English term → explanation); the only place German appears
- `ARCHITECTURE.md` — how the system works, and how it scales to a tenant-based 100+ practice system
- `CONSTITUTION.md` — minimum requirements every change must meet
- `IMPLEMENTATION_NOTES.md` — findings, edge cases, decisions, deviations
- `CLAUDE.md` — agent instructions
