# mpp-case-study-der-ausfall-implementation

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on `homj/mpp-case-study-der-ausfall-implementation` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Writing style

Diagrams in Markdown files use Mermaid code blocks, never ASCII art.

Write all prose (docs, comments, commit messages, issues, chat replies) in ASD-STE100 (Simplified Technical English): short sentences, one idea per sentence, active voice, approved simple words, present tense, no noun clusters or ambiguous pronouns.

Also follow Zinsser's four principles of quality writing:

1. Simplicity — strip every sentence to its cleanest components.
2. Brevity — cut every word that does no work.
3. Clarity — say exactly what you mean; leave no room for misreading.
4. Humanity — write as a person to a person; keep warmth and a real voice.

## Project docs

Keep these files current. Update them in the same change that makes them stale.

- `README.md` — assumptions, things explicitly left out, next steps, and the reason for each library choice.
- `ARCHITECTURE.md` — how the system scales to a tenant-based system with 100+ practices.
- `CONSTITUTION.md` — minimum requirements. Validate every change against it before you call the change done. Business logic is built test-first (use the `tdd` skill); APIs are type-safe end to end; security, privacy (GDPR), accessibility, and UX are top priorities.
- `IMPLEMENTATION_NOTES.md` — log all findings: data inconsistencies, edge cases, decisions. If an edge case forces you to deviate from the plan, pick the conservative option, log it under "Deviations", and keep going.

## Language

The codebase is English only: code, identifiers, comments, docs, commits, issues, and chat replies. Source material (case study, data, requirements) may be German. When you meet a German domain term, translate it and add a row to the glossary in `CONTEXT.md` (German term, English term, explanation). Use the English term from the glossary everywhere else. German appears nowhere but that glossary and the `de` locale files (see i18n below).

## i18n

Build the application with i18n from the start. The first UI language is German; English follows later.

- No hard-coded user-facing strings. Every user-facing string goes through the i18n layer.
- Translation keys are English, named by meaning, not by position (for example `invoice.status.overdue`, not `label_3`).
- `de` is the default locale and must be complete. Keep an `en` locale file in place from the start, even if it only holds keys or placeholders.
- Format dates, numbers, currency, and plurals through locale-aware APIs, never by string concatenation.
- Keep translation files in one known place and note it in `ARCHITECTURE.md`.
- The English-only rule above applies to the codebase. German is allowed in the `de` locale files and in the `CONTEXT.md` glossary, nowhere else.
