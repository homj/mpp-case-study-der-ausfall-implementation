---
status: accepted
date: 2026-08-19
---
# Every table carries `tenant_id` from the first migration; row-level security is deferred

The target is a system for 100+ practice groups. Retrofitting a tenant column is the expensive part of multi-tenancy, so every table has `tenant_id` and every query is scoped by it from the start, with one seeded tenant (meinphysio+). Postgres row-level security, per-tenant configuration, and per-tenant connectors are deferred and will each get their own ADR.
