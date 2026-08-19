# Architecture

How this system works today, and how it scales to a tenant-based system with 100+ practices.

## Current state

Case study scope: one tenant (meinphysio+), two locations, master data as JSON seed files in `data/`, full Termino appointment exports every 5 minutes (JSON, window ~2 weeks back to ~1 week ahead). No write path to Termino. Components and data flow:

```
data/*.json ──seed/ingest──▶ PostgreSQL (tenant_id on every table)
                                   ▲            │
Termino export (every 5 min) ──ingest + reconciliation        │ repositories (packages/db)
                                   │            ▼
                             apps/api (Hono, zod contracts, OpenAPI)
                                   │   uses packages/domain (pure engine: affected → decide → rank)
                                   │   writes outbox rows → fake TerminoClient / fake Notifier deliver them
                                   ▼
                             apps/web (TanStack Start, shadcn/ui, i18n de/en) — front desk UI
```

Flow for one absence: front desk records absence → API blocks the practitioner in Termino (outbox) → engine decides per affected appointment → reschedule tasks per patient → auto-rebook writes + notifications go to the outbox → fake adapters deliver → next export reconciles (confirms writes, closes tasks resolved externally, adds new affected appointments). See ADR-0001, ADR-0002.

## Target: multi-tenant, 100+ practices

### Tenancy model

- How a tenant (practice group) is identified in every request: today a single seeded tenant; next step is a tenant header/claim resolved by middleware and passed to every repository call (`tenant_id` is already on every table, ADR-0003).
- How tenant data is isolated (shared schema with tenant key, schema per tenant, or database per tenant) and why.
- How cross-tenant access is prevented at the data layer, not only in application code.

### Scaling concerns

- **Data**: volume per practice, growth rate, retention, backups per tenant.
- **Compute**: stateless services, horizontal scaling, background jobs per tenant.
- **Isolation**: noisy-neighbour limits, rate limits, per-tenant quotas.
- **Configuration**: per-practice settings, feature flags, onboarding of a new practice.
- **Operations**: observability with tenant as a dimension, per-tenant incident blast radius.
- **Compliance**: data residency, audit logs, deletion on tenant exit.
- **i18n**: locale per tenant (and per user where needed); `de` default, `en` later. Translation files location: _(fill in when chosen)_.

### Migration path

Steps to move from the current state to the target, in order. Each step must leave the system working.

1. _(none yet)_

## Decisions

Link to ADRs in `docs/adr/` when they exist. Summarize the key ones here.

- _(none yet)_
