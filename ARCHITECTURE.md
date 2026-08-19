# Architecture

How this system works today, and how it scales to a tenant-based system with 100+ practices. Decisions with their reasons live in `docs/adr/`; this file is the map.

## 1. What it does

A practitioner becomes absent (sick, emergency, planned). The **Umbuchungsassistent** (rescheduling engine) looks at every affected appointment, rebooks what it can safely rebook, notifies the patients, and hands the rest to the front desk as **reschedule tasks** in one queue. The front desk works the queue; every action is written to Termino (the external booking tool) through an outbox and confirmed against later Termino exports.

## 2. Current state (case study, 2026-08-19)

One tenant (meinphysio+), two locations, seven practitioners, master data seeded from `data/*.json`, Termino appointment exports every 5 minutes (JSON, window about 2 weeks back to 1 week ahead). Termino is fictional: reads come from the export files, writes go to a fake client.

### Components

```
                         ┌──────────────────────────────────────────────────────────┐
 data/*.json ──seed────▶ │ PostgreSQL  (every table has tenant_id, ADR-0003)        │
 Termino export ─ingest─▶│ locations · practitioners · patients · prescriptions     │
   (every 5 min)         │ termino_exports · appointments · absences                │
                         │ reschedule_tasks · affected_appointments · outbox        │
                         │ data_issues                                              │
                         └───────────────▲──────────────────────────────────────────┘
                                         │ packages/db  (Drizzle schema, migrations, repositories, ingest)
                                         │
 ┌───────────────────────────────────────┴──────────────────────────────────────────┐
 │ apps/api  — Hono, zod contracts (packages/contracts), OpenAPI at /docs (ADR-0002) │
 │   services/absence-service: create absence → engine → tasks → outbox → deliver    │
 │   services/reconcile: confirm Termino writes against later exports (ADR-0001)     │
 │   adapters: TerminoClient (fake) · Notifier (fake) — both behind the outbox        │
 │   uses packages/domain (pure engine, zero I/O, tests): affected → decide → rank    │
 └───────────────────────────────────────▲──────────────────────────────────────────┘
                                         │ typed HTTP client
 ┌───────────────────────────────────────┴──────────────────────────────────────────┐
 │ apps/web — TanStack Start, shadcn/ui, react-i18next (de default, en stub)         │
 │   Offene Fälle (one queue across absences) · + Neuer Ausfall (dialog) · Ausfälle  │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

Processes: `db`, `api`, `web` (docker compose). `packages/domain` and `packages/db` are libraries; `domain` imports nothing, `db` imports only domain types.

### Flow for one absence

1. Front desk records the absence (practitioner, category, date-time range). The API blocks the practitioner in Termino (outbox row, ADR-0001).
2. The engine (`packages/domain`) finds affected appointments (time-span overlap), decides per appointment — imminent → same-time swap or front desk; auto-rebook when the policy allows (qualification match, same location, ±2 days, gap fits, patient contactable; ADR-0004); else proposal or front desk; when same-day coverage is impossible a cancellation notice for today goes out — and ranks the tasks.
3. Decisions become reschedule tasks (one per patient per absence). Auto-rebookings become Termino writes + notifications in the outbox; the fake adapters deliver them.
4. The front desk works the queue: quick actions (accept proposal, cancel and notify, log contact attempt, kept) call the API, which writes through the outbox.
5. Each new Termino export is ingested idempotently. Reconciliation protects locally written appointments from stale exports, confirms writes per type (cancel, swap, rebook; a confirmed rebook retires the local row), flags writes unconfirmed after two exports, closes tasks resolved externally, and adds tasks for new bookings inside an absence.

### Data issues

Ingest records what it cannot reconcile: unknown practitioner IDs (`prac_03`), unmatched patients (Lena Krause), fuzzy matches (Katrin Meier/Meyer). They are shown to the front desk; automation does not depend on identity resolution.

## 3. Target: multi-tenant, 100+ practices

### Tenancy model

- **Tenant = practice group** (for example meinphysio+); **locations** are sites under it. Every table already carries `tenant_id` (ADR-0003).
- **Identification**: a tenant claim in the auth token (or, for service calls, a tenant header) resolved by API middleware into a request context; every repository call takes the tenant id. No query without it.
- **Isolation**: shared schema with `tenant_id` + **PostgreSQL row-level security** as the next step (one ADR: RLS policies per table, a `SET app.tenant_id` per connection/transaction). Schema-per-tenant or database-per-tenant only if a tenant needs it for compliance; the adapter and repository layers make that a deployment choice, not a code rewrite.
- **Cross-tenant protection** at the data layer (RLS), not only in application code. Tests: a tenant A request can never read tenant B rows, enforced by the database.

### Integration per tenant

- **Booking tool connector**: today one fake `TerminoClient`. Target: a connector interface per booking tool (Termino, others) with per-tenant configuration (credentials, export source, polling cadence). The outbox + reconciliation pattern is connector-agnostic.
- **Notification provider**: `Notifier` interface with real SMS/email providers per tenant, per-patient channel preference, delivery receipts, and a confirm/decline link so patients can answer an automated rebooking.
- **Outbox worker**: durable queue drain with retries, backoff, circuit breaker, idempotency keys (ADR-0001 consequences). Runs as a separate process; the API only enqueues.

### Scaling concerns

- **Data**: 100 practices × ~2,000 appointments per export window ≈ 200k upserts every 5 minutes. Ingest in chunks (already), partition `appointments` by tenant (and optionally by month), keep export snapshots with a retention policy, index on (`tenant_id`, `termino_practitioner_id`, `starts_at`).
- **Compute**: stateless API, horizontal scaling; ingest and the engine as background jobs per tenant with a work queue; the engine is pure and cheap (one absence = one in-memory computation over the tenant's window).
- **Isolation**: per-tenant rate limits and quotas on writes to the booking tool and on notifications; a noisy tenant cannot delay another tenant's ingest.
- **Configuration**: the auto-rebook policy, priority ranking, prescription-warning thresholds, message templates, and service-label → code mapping become **per-tenant configuration** (ADR-0004 already keeps them as data).
- **Operations**: logs, metrics, and traces carry `tenant_id`; alerts per tenant (unconfirmed writes, failed deliveries, ingest lag). Incident blast radius is one tenant.
- **Compliance (GDPR)**: health-adjacent personal data — EU hosting, encryption at rest, audit log of access to patient data, data-processing agreements per tenant, export and deletion per patient and per tenant (tenant exit = delete by `tenant_id`). Notifications are outbound personal data: log recipient and channel, not message bodies, once real providers exist.
- **i18n**: locale per tenant with per-user override; `de` today, `en` next; server-side message keys + params so free text in warnings and data issues is translated, not English inside a German UI.

### Auth and roles (not in the case)

Front-desk users, practice managers, and admins per tenant; single sign-on for practice groups. Authorization sits in the API; the UI only hides.

### Migration path (each step leaves the system working)

1. **Tenant context in the API**: resolve tenant from auth/header; thread it through every repository call (today: a constant default tenant).
2. **Row-level security**: policies on every table; tests that prove isolation. ADR.
3. **Outbox worker + real adapters**: move delivery out of the request path; real Termino client and notification provider for the first tenant; circuit breaker and staleness alerts.
4. **Per-tenant configuration**: policy, ranking, templates, service mapping in a `tenant_settings` table with defaults.
5. **Ingest as a job**: scheduled per tenant, with lag metrics; partitioning when the first tenant exceeds the window size that hurts.
6. **Onboarding**: a new practice = tenant row + connector config + master-data import + first ingest; no deploy.
7. **Auth + roles**, then **patient self-service** (confirm/decline links), then the **Tagesplan** calendar view (vertical time, practitioners as columns) as the result view.

## 4. Decisions

- ADR-0001 — Termino through one adapter, outbox, optimistic writes reconciled against exports.
- ADR-0002 — Dedicated, explicit HTTP API instead of framework-embedded server functions.
- ADR-0003 — `tenant_id` from day one; RLS deferred.
- ADR-0004 — Auto-rebook policy and ranking as data in the domain package.

## 5. What is done, what is open (end of the case-study time box)

Done: domain engine with tests; schema, seed, idempotent ingest with data-issue detection; API with OpenAPI for absences, tasks, quick actions, ingest + reconciliation, data issues; fake Termino client and notifier behind an outbox with confirmation and staleness; web app (queue across absences, new-absence dialog, case sheet, absences page) on shadcn/ui with German default locale; `docker compose up`.

Open (see `README.md` → Next steps): outbox worker with retries/backoff/circuit breaker; real adapters; confirm/decline links for patients; server-side i18n for free text; `rebooked_manually` with a slot picker; undo flow in the UI; data-issue resolution dialogs; service-level tests; tenant context, RLS, per-tenant configuration; Tagesplan view; auth and roles.
