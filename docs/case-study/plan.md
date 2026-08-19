# Build plan (≈80 minutes remaining of 3 h)

Tracer-bullet slices. Each is demoable on its own; later slices are the first to be dropped. Decisions behind this plan: `analysis.md`, `docs/adr/`, glossary in `CONTEXT.md`.

## Layout

```
apps/api          Hono (Node 24) — explicit HTTP API, OpenAPI from zod contracts; runs migrate → seed → ingest 08:00 on start
apps/web          TanStack Start + shadcn/ui + Tailwind v4 + react-i18next (de default, en stub); typed client of the API
packages/domain   pure TS: types, service-label map, slot finder, auto-rebook policy, resolution engine, priority sort — TDD, zero I/O
packages/db       Drizzle schema (+ tenant_id everywhere), migrations, seed + ingest, repositories mapping rows ↔ domain types
packages/contracts zod schemas shared by api and web
docker-compose.yml  db (postgres:17), api, web — `docker compose up`
```

`domain` and `db` are independent: `db` imports `domain` types; `domain` imports nothing.

## Slices

| # | Slice | Demo | Est. |
|---|-------|------|------|
| 0 | Scaffold: workspace, packages, compose, migrations, seed master data, ingest export 08:00 | `docker compose up` → API health + row counts | 15 min |
| 1 | Domain engine (TDD): affected appointments (overlap), slot finder, auto-rebook policy, resolution engine (imminent / auto / proposal / same-day-impossible), priority sort, prescription warnings | `pnpm test` green in `packages/domain` | 20 min |
| 2 | API: `POST /absences` (block practitioner via Termino fake → outbox; run engine → reschedule tasks, outbox writes + notifications), `GET /absences/:id/tasks`, quick actions `accept_proposal`, `cancel_and_notify`, `log_contact_attempt`, `POST /exports/ingest` (08:05, minimal reconciliation), `GET /data-issues` | curl the flow for Anna / 2026-09-07 | 15 min |
| 3 | Web: new-absence form; tasks page (open tasks ranked, quick actions; automated actions below), outbox + Termino writes panel, data issues panel, Demo-clock badge | front desk walks through Anna's Monday | 20 min |
| 4 | Docs: README library choices + where we stopped, notes, glossary check | — | 10 min |

## Cut first if time runs out (in order)

reconciliation beyond "ingest + re-diff count" → undo dialog → `rebooked_manually` slot picker → data-issue resolution dialogs (display only) → en locale strings (keys only).

## Never cut

outbox for writes and notifications, audit of automated actions, Demo-clock label, tests in `packages/domain`.
