---
status: accepted
date: 2026-08-19
---
# A dedicated, explicit HTTP API (`apps/api`) instead of framework-embedded server functions

The rescheduling capabilities must be callable by more than the web UI — a tablet app at the front desk or an agent via MCP are expected. We therefore run a separate API service (Hono on Node 24) with zod-defined contracts in `packages/contracts`, an OpenAPI document generated from them, and a typed client the TanStack Start web app consumes. TanStack Start server functions are not used for domain operations.

## Considered options

- TanStack Start server functions only — cheapest for the web UI, but ties the API to the web framework and gives non-TS clients nothing.
- tRPC — end-to-end TS types, but no standard contract for non-TS consumers without extra tooling.
