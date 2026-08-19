---
status: accepted
date: 2026-08-19
---
# Termino is integrated through one adapter, with an outbox and export reconciliation

Termino is an external booking tool we read through 5-minute full exports and (by decision) can write to. All writes go through a single `TerminoClient` port; the case-study implementation is a fake that records writes. Every intended write is first persisted as an outbox row (`pending`), applied optimistically to our local appointment state, delivered with retries and backoff, marked `delivered`, and finally `confirmed` when a later export reflects it. If delivery keeps failing the write is marked `failed` and the reschedule task shows "not synced to Termino — execute manually"; we never pretend success and never lose intent. Reconciliation on each export also closes tasks resolved externally and creates tasks for new bookings inside an absence.

## Considered options

- Direct synchronous calls without an outbox — loses intent on failure and cannot explain drift between our state and Termino's.
- Read-only integration (propose, human executes) — rejected by product decision; the architecture above still works if the write path disappears.

## Consequences

- The outbox is the durable queue. A worker drains `pending` rows in order with exponential backoff; on repeated failure a circuit breaker stops calling Termino and re-probes periodically. Rows stay `pending` through a long outage; the UI shows how many and since when, and offers "executed manually in Termino" as a fallback.
- Every write carries an idempotency key (the outbox id) so retries after timeouts cannot double-book.
- Notifications share the table and the rules: a rebooking message is sent only after its Termino write is at least `delivered`.
- Case-study build: table, statuses, fake adapters, UI visibility. Worker, backoff, circuit breaker are stubbed and listed under "where we stopped".
