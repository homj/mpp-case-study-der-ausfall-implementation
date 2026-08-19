# Constitution

Minimum requirements. Validate every change against this list before you call it done. If a change cannot meet a rule, stop and log it under "Deviations" in `IMPLEMENTATION_NOTES.md`.

## Starter rules

These are a baseline. Edit, remove, or extend them for this project.

1. **Tests pass.** Run the full test suite before you finish. Do not skip failing tests.
2. **No secrets in the repo.** No keys, tokens, passwords, or personal data in code, config, or history.
3. **Tenant isolation.** No code path may read or write another tenant's data. Enforce at the data layer.
4. **Conservative on ambiguity.** When a spec is unclear, pick the safer, smaller option and log it.
5. **Docs stay current.** Update `README.md`, `ARCHITECTURE.md`, and `IMPLEMENTATION_NOTES.md` in the same change that makes them stale.
6. **One idea per change.** Keep commits and PRs small and focused.
7. **English only.** German appears only in the glossary in `CONTEXT.md` and in the `de` locale files. Every German domain term gets a row in the glossary with its English term and an explanation.
8. **i18n-ready.** No hard-coded user-facing strings. All UI text goes through the i18n layer with English keys. `de` is the default locale; an `en` locale file exists from the start.
9. **TDD for business logic.** Use test-driven development for business logic, above all in the backend: write the test first, watch it fail, then make it pass. Tests are the source of truth. If the implementation fails a test, the implementation is broken, not the test. Do not change a test to make code pass unless the test itself is shown to be wrong, and log that in `IMPLEMENTATION_NOTES.md`.
10. **Type-safe APIs.** Every API boundary (HTTP, RPC, client-server, module contracts) is fully typed end to end. Request and response shapes come from one shared definition. No `any`, no untyped JSON, no hand-written duplicate types.
11. **Security, privacy (GDPR), accessibility, and UX are top priorities.** Every change must hold all four:
    - *Security*: least privilege, input validation at every boundary, no secrets in code, dependencies kept current.
    - *Privacy (GDPR / DSGVO)*: collect only needed personal data, know where it lives, support export and deletion, log access to sensitive data.
    - *Accessibility*: meet WCAG 2.1 AA — keyboard access, labels, contrast, screen-reader support.
    - *UX*: clear flows, helpful errors, no surprises. When a trade-off forces a choice, security and privacy win, then accessibility, then UX; log the trade-off.

## Project-specific rules

From the case study brief (`docs/case-study/brief.md`).

- **Stack**: TypeScript, PostgreSQL, React frontend. Frameworks and libraries are our choice; each choice is justified in `README.md`.
- **One-command start**: the whole project starts with one command, for example `docker compose up`. Test this before you call a change done.
- **Time-box**: 3 hours of implementation. Unfinished is fine; `README.md` must say where we stopped.
- **Judgement over volume**: prefer a small, well-reasoned tool over a large one. Log every non-obvious decision in `IMPLEMENTATION_NOTES.md`.
- **Time zones**: store UTC, display Europe/Berlin. Never compare export timestamps to Berlin wall-clock without converting.
- **One adapter for Termino writes**: never call Termino outside `TerminoClient`. Every write is recorded locally first, applied optimistically, and reconciled against the next export.
- **One adapter for notifications**: never send outside `Notifier`. Every message lands in the outbox with recipient, channel, and body, so the UI can show what was sent.
- **Automated actions are auditable and reversible**: every automatic rebooking or notice is logged with its reason and can be undone from the UI.
- **Location switch is never automatic**: propose with a warning; a human confirms.
- **Never cancel an imminent appointment automatically**: offer a same-time practitioner swap or hand to the front desk.
- **Data gaps go to the front desk, not under the rug**: unknown patients, fuzzy matches, and unknown practitioner IDs are shown in a data-issues panel.
- **Tolerate bad foreign keys on ingest**: unknown practitioner, location, or patient IDs in an export must not crash the import; surface them.
