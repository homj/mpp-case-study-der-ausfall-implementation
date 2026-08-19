# Analysis: "The Outage"

Pre-implementation analysis. Nothing is built yet. Brief: `brief.md`. Data: `../../data/`.

Status legend for facts: **[V]** verified by us against `data/` with a query; **[L]** lead from the prior discovery pass in the sibling repo, not yet re-verified; **[A]** assumption.

## 1. What problem this actually is

The brief reads like a scheduling problem. The data says it is a **scarcity and communication problem**.

- Anna Weber (`prac_01`, qualifications KG, MT, MLD45) has **14 booked** appointments on Monday 2026-09-07, 9 at `loc_01` in the morning and 5 at `loc_02` in the afternoon. **[V]**
- She needs about **300 treatment minutes** (13 × 20 min + 1 × 40 min). **[V]**
- Her colleagues working Monday have only **200 free minutes combined** (Brandt 60, Lindqvist 40, Okafor 60, Falk 40, Aydin 0; Petersen does not work Mondays), in scattered 20-minute gaps at fixed clock times, and not all are qualified for MT or MLD45. **[V]** (two independent computations agree; see §8) → at most ~10 of 14 could move today in theory; far fewer in practice.
- The call comes at **07:40**, the first patient arrives at **08:00**. The 08:00 and 08:20 patients are effectively unreachable in time; they become walk-in handling at the front desk.

So the binding constraint is **not** "find the optimal allocation" but "**decide fast who gets the few slots, inform everyone else in the right order, and do not lose track while the phone rings**". With a write path to Termino and automated notifications (decided 2026-08-19, see §3), the tool should **resolve the clean cases itself** (rebook + notify) and hand the front desk only the **exceptions**, ranked by urgency. An exception queue with an audit trail, not a calendar solver.

This also tells us what "judgement" means for this case: the tool must be honest about what it cannot do (for example: MLD45 cannot be covered today), and it must make the front desk faster, not replace their decision.

## 2. Verified facts and planted traps in the data

| # | Fact | Status | Consequence for the tool |
|---|------|--------|--------------------------|
| F1 | Export is an object `{tool, export_id, exported_at, window, appointments[]}`; 1927 appointments in the 08:00 export | [V] | `export_id` is the idempotency key for ingest |
| F2 | Timestamps are UTC (`Z`). 08:00 Berlin = `06:00:00Z`. File names carry Berlin local time | [V] | Store UTC, display Europe/Berlin. Classic off-by-2h trap |
| F3 | Anna has **15** records on 09-07: 14 `booked` + 1 `cancelled` (Peter Albrecht, 11:40 Berlin) | [V] | Filter by status or the tool calls a patient whose slot was already cancelled |
| F4 | Export window `2026-08-24` → `2026-09-13`; last appointment is Fri `2026-09-11` | [V] | Forward visibility < 1 week. Units used before 08-24 are invisible → remaining prescribed units are an estimate, never a fact |
| F5 | Marek Kowalski is booked **twice** under Anna on 09-07 (10:00 `loc_01`, 16:20 `loc_02`) | [V] | Group by patient, not by appointment. If only one slot can be saved, which? |
| F6 | Brigitte Hoffmann: service "Lymphdrainage 45 Min." but `duration_min` = 40 | [V] | Scheduling duration ≠ service duration; never derive one from the other |
| F7 | Services in the export are German labels ("Krankengymnastik", "Manuelle Therapie", "Lymphdrainage 45 Min."), not the codes (`KG`, `MT`, `MLD45`) used in qualifications and prescriptions | [V] | Need an explicit service-label → code mapping on ingest |
| F8 | Gisela Neumann (09:40, MT): no phone in master data or Termino, email only; prescription (MT, 10 units, 1/week) issued 2026-08-10 = 28 days before 09-07 | [V] | Reachability is a per-patient attribute and feeds urgency |
| F9 | Lena Krause (08:20): exists only in Termino (`pat_03115`) — no master record, no prescription | [V] | Identity resolution can fail. UI must show "unknown patient", not crash or skip |
| F10 | "Katrin Meier" (Termino) vs "Katrin Meyer" (master, `termino_patient_id: null`), same birth date / contact | [V] | Fuzzy matching; auto-link vs human-confirm is a policy decision |
| F11 | 08:00 vs 08:05 exports differ by 3 appointments: `apt_003565` moved (prac_08), `apt_004498` cancelled (prac_04), `apt_006783` new (prac_02) | [V] | The schedule drifts in minutes. Any plan can go stale mid-execution → reconciliation against each new export is core, not optional |
| F12 | Ghost practitioner `prac_03` in the export, absent from master data (5 past appointments) | [V] | Ingest must tolerate unknown foreign keys |
| F13 | Dropping Monday puts all 13 matched patients below `frequenz_pro_woche`. Every "other appointment this week" of these patients is **also with Anna** (Ahrens 09-09, Oeztuerk / Fischer / Hoffmann 09-10), so a multi-day absence cascades | [V] | Prescription-continuity risk is the main tiebreaker for who gets a scarce slot |
| F14 | The MLD45 appointment (Hoffmann, 14:40) is structurally uncoverable today **and within ±2 days**: the only other MLD45 practitioner (Aydin, Kreuzberg) has zero gaps Mon–Wed (19–20 bookings/day, fully packed) | [V] | The tool must say "no coverage possible" honestly and suggest a waitlist, not pretend |
| F15 | Exactly one prescription per patient (557 prescriptions, 557 distinct `patient_id`). Of the 560 master patients, 558 link to Termino; 2 have `termino_patient_id: null` (Katrin Meyer = F10; Yasmin Vogt, no export match, unrelated) | [V] | The data model can assume 1 active prescription per patient for this case; keep the schema 1:n anyway |
| F16 | Service labels map 1:1 to codes: "Krankengymnastik" → KG, "Manuelle Therapie" → MT, "Lymphdrainage 45 Min." → MLD45, "Geraetegestuetzte Krankengymnastik" → KGG (Termino strips umlauts). Durations are constant per service: KG/MT 20, MLD45 40, KGG 60 | [V] | Mapping is a small static table; add an "unknown service" path anyway |
| F17 | Brigitte Hoffmann's MLD45 prescription has 6 units; 4 used in-window before today, today = 5, her 09-10 slot = 6 → exhausted this week (in-window count; true count may be higher) | [V] | Surface "prescription nearly used up" as a soft warning; combine with F14 (uncoverable) → she is the hardest case |
| F18 | Marek Kowalski: prescription KG, 6 units, **1/week**, yet booked twice on Monday (F5) | [V] | If only one slot can be saved, one is enough for the frequency; flag the duplicate rather than rebook both |
| F19 | No patient lacks both phone and email. Neumann (F8) is the only one without a phone. Zero booked appointments outside working hours, zero overlaps, no duplicate IDs, all timestamps UTC, all dates ISO | [V] | The dataset is clean apart from planted anomalies; don't over-invest in defensive parsing, invest in the anomaly paths |
| F20 | The 3 changes between the 08:00 and 08:05 exports (F11) do not touch Anna or 09-07 | [V] | Reconciliation can be demonstrated on those 3; the crisis-day plan itself is stable across the two exports |

All rows are verified. The profile was produced independently by a subagent with jq/python and spot-checked by us; the capacity numbers also agree with the earlier discovery pass.

## 3. Judgement calls (our decisions, with reasons)

| Decision | We choose | Why | Toggle if wrong |
|----------|-----------|-----|-----------------|
| Write path to Termino? | **Yes (decided 2026-08-19).** All writes go through one `TerminoClient` adapter (rebook, cancel, create). For the case the adapter is a fake that records the write locally; the real one is a drop-in. Writes are applied optimistically in our DB and confirmed or contradicted by the next export | Termino is fictional; we cannot call it, but the architecture must be ready for it. Reconciliation stays necessary because exports lag writes by up to 5 minutes | Swap the fake adapter for a real client |
| Optimise or triage? | **Auto-resolve clean cases, triage the rest**; no optimiser | Scarcity already decided the allocation (§1). A greedy rule (earliest affected appointment first, best-matching slot) is good enough and explainable; 3 h is better spent on the exception workflow, notifications, and reconciliation | Add a solver later as a suggestion source |
| Priority order | **Time-to-appointment** ascending, then **prescription risk** (freq=1 and no other slot this week first), then **reachability** (no phone → lower, since a call will not work) | Time pressure is the first-order constraint; continuity risk is the regulatory one; reachability decides *how* to inform | Priority is one sort function; keep it swappable and allow manual override |
| Prescription rules (28-day start, interruption, frequency) | **Warnings, never hard blocks** | We cannot compute true remaining units (F4); hard blocks on estimates would be wrong | Harden specific checks once a treatment-documentation source exists |
| Fuzzy identity (F10) | **Suggest, human confirms** | Health data; a wrong auto-link leaks one patient's data into another's record | Auto-link above a confidence threshold |
| Hardcode Anna / 09-07? | **No.** Parameterise by practitioner and date range | Almost free, and turns a demo into a tool (Anna may be sick tomorrow too) | — |
| Notifications | **Automated email/SMS for every automated action** (rebooking, cancellation notice) through one `Notifier` adapter; for the case a fake that writes to an outbox table shown in the UI. **A front-desk phone call is the last resort** (no email and no phone, message bounced, imminent appointment, or patient must choose) | Decided 2026-08-19. Automation is the point; the front desk's time goes to exceptions | Swap the fake for a provider; add per-patient channel preference |
| Auto-reschedule criteria | Rebook **without asking** only when all hold: practitioner's **qualifications cover the appointment's service code**, **same location**, start within **±2 days** of the original (same day preferred, then closest start time), free gap ≥ `duration_min`, patient has email or phone. Everything else is a proposal for the front desk | Decided 2026-08-19. Qualification match is the hard gate; the ±2-day window is an explicit guess, kept as one config value | Tune the window; allow per-patient or per-service windows |
| Location switch (Mitte ↔ Kreuzberg) | **Last resort, never automatic.** Shown as a proposal with a warning; the front desk confirms | Decided 2026-08-19 | — |
| Imminent appointments (already past or < 30 min away) | **Do not cancel.** First look for a qualified practitioner free at the **same time and location** and offer a one-off practitioner swap; if none, hand to the front desk for walk-in handling. Patient is likely already travelling | Decided 2026-08-19 (Q8). For 09-07 nobody is free at Mitte at 08:00 or 08:20, so Czerny and Krause go to the front desk | Tune the "imminent" threshold |
| Same-day coverage impossible | Once the engine **knows for sure** that no qualified practitioner has a fitting gap at the same location today (imminent swap included), send a **cancellation notice for today immediately** (email/SMS: "today's appointment cannot take place"). Then: if an auto-rebook within ±2 days exists, do it and say so in the same message; else queue a **front-desk call** (other-location option, slot beyond the window, waitlist) | Decided 2026-08-19 (Q8 follow-up). Prevents a wasted trip; the notice is true regardless of how the rebooking ends. Cross-location same-day slots are a human option and do not block the notice | Hold the notice until the front desk has looked at cross-location options |
| Unknown patient (Krause, F9) | **Treat as self-payer and keep the appointment in play**, but surface as a data gap the front desk must resolve (link or create master record) | Decided 2026-08-19 (Q5) | — |
| Ghost practitioner `prac_03` (F12) | **Surface to the front desk** in a data-issues panel with the 5 affected appointments; do not ignore, do not auto-fix | Decided 2026-08-19 (Q9) | Add "map to practitioner" / "mark as departed" actions |
| Data model for exports | **Keep every snapshot**, upsert current state idempotently by `export_id` | Reconciliation and "what changed since the plan" need history | Prune old snapshots |

## 4. Open questions and the assumptions we take

| # | Question | Assumption we proceed with |
|---|----------|----------------------------|
| Q1 | Is there any write path to Termino? | **Yes** (decided 2026-08-19). Adapter + fake for the case |
| Q2 | Push or pull export delivery? | Irrelevant for the case; ingest is idempotent either way |
| Q3 | Does the practice enforce the prescription rules or only track them? | Track; show warnings |
| Q4 | May a patient be moved between locations (Mitte ↔ Kreuzberg)? | **Last resort only** (decided). Warning, never automatic |
| Q5 | May a patient with no prescription on file (Krause) be treated or rebooked? | **Yes, as self-payer** (decided); always surface as a data gap |
| Q6 | How long is Anna out? | Unknown at decision time. Today is firm; later days are provisional. The tool must be re-runnable |
| Q7 | Who informs patients and how? | **Automated email/SMS** for automated actions (decided). Front-desk call is the last resort |
| Q8 | What about the 08:00 slot that is already past / imminent? | **Offer a same-time practitioner swap if one is free; never cancel right away** (decided). Commercial handling out of scope |
| Q9 | `prac_03`: departed employee or data bug? | **Surface to the front desk to handle** (decided); tolerate on ingest |

## 5. Proposed solution direction (no implementation yet)

**Outage cockpit** for the front desk: automate the clean cases, queue the exceptions.

1. **Ingest**: PostgreSQL. Master data seeded from `data/*.json`. Every export ingested idempotently (by `export_id`), history kept. Service labels mapped to codes. Unknown foreign keys tolerated **and surfaced** (data-issues panel: `prac_03`). Patient identity resolved: exact link by `termino_patient_id`, else suggested fuzzy match (name + birth date + contact; Meier/Meyer), else "unknown patient — self-payer assumed" (Krause).
2. **Absence**: pick practitioner + date (range) → affected `booked` appointments, grouped by patient, ordered by time-to-appointment.
3. **Resolution engine**, greedy in that order, one decision per appointment:
   - *Imminent* (past or < 30 min): same-time, same-location qualified practitioner free? → propose one-off swap; else → front desk, walk-in handling. Never cancel.
   - *Auto-rebook* (criteria in §3: qualifications match, same location, ±2 days, gap fits, contactable): rebook via `TerminoClient`, notify via `Notifier`, record as done with undo. If today was lost, the same message carries the cancellation of today and the new slot.
   - *Proposal* (needs a human): slot outside ±2 days but inside the export window, cross-location (warning), duplicate booking (Kowalski: keep one), prescription warnings (Hoffmann near limit, Neumann 28 days).
   - *Same-day impossible, no auto-rebook either*: cancellation notice for today now, queue front-desk call. Hoffmann / MLD45 lands here: Aydin is the only other MLD45 practitioner and has zero gaps on Mon, Tue, and Wed (verified), so ±2 days does not help; Hoffmann's own 09-10 MLD45 slot is with Anna too.
4. **Exception worklist UI**: ranked by priority rule; per patient: what the engine did or proposes, why, alternatives, contact data and channel, reachability flag, message preview, **status** the front desk sets (open → in progress → done / unreachable). Audit trail of all automated actions with one-click undo. Data-issues panel (unknown patient, fuzzy match to confirm, ghost practitioner).
5. **Adapters**: `TerminoClient` (fake: records writes in a `termino_writes` table) and `Notifier` (fake: writes to `outbox`). Both shown in the UI so the demo is honest about what "sent" means.
6. **Reconciliation**: every new export re-diffs against open items and optimistic writes: confirm executed actions, flag conflicts ("slot was just taken", "patient already rebooked elsewhere", "write not reflected after 2 exports").

**Rejected**: a constraint-solving auto-rescheduler. Scarcity makes it pointless here; greedy-by-urgency is explainable to the front desk.

## 6. Scope for the 3-hour build (proposal, to confirm before building)

**Must**: ingest + identity resolution; absence → affected appointments; resolution engine with auto-rebook + same-time swap + uncoverable path; fake `TerminoClient` and fake `Notifier` with outbox; exception worklist with status and audit trail; data-issues panel (Krause, Meier/Meyer, `prac_03`); one-command start.
**Should**: cross-location and other-day proposals with warnings; undo of automated actions; reconciliation diff against the 08:05 export.
**Could**: multi-day provisional plan; manual priority override; per-patient channel preference.
**Won't**: real email/SMS provider, real Termino API, auth, optimiser, billing.

This is more than the earlier scope because Q1 and Q7 add two adapters and an engine. If time runs short, the fallback order is: drop reconciliation → drop undo → drop cross-location proposals. Never drop the outbox or the audit trail: without them the automation is not demonstrable or trustworthy.

## 7. Main risks

- **Timezone bug** (F2) — mitigate with a test that asserts the 08:00 Berlin slot is `06:00Z`.
- **Over-promising slots** — every suggestion must be re-checked against the latest export before the front desk acts on it.
- **Privacy** — Termino patient copies and our master data are both health-adjacent personal data; keep them in the DB, never in logs or URLs.
- **Running out of time on ingest** — mock the worklist UI with the real 14 patients first if ingest drags; the front-desk workflow is where wrong assumptions cost most.
- **Automation without consent** — an auto-rebooked patient may not make the new time. Mitigation: tight auto-rebook criteria (§3), a message that names the front desk number to decline, one-click undo, and the audit trail. A real deployment needs a confirm/decline link; noted as future work.
- **Write-then-export lag** — our optimistic state and Termino's export disagree for up to 5 minutes. Mitigation: reconciliation marks writes "pending" until an export reflects them and alerts after two exports without confirmation.

## 8. Appendix: Monday 2026-09-07 capacity (Berlin time, other practitioners)

Working intervals minus booked appointments, per practitioner. Only services Anna uses (KG, MT, MLD45) matter.

| Practitioner | Location | Qualifications | Free gaps Monday | Free min |
|-----------|----------|----------------|------------------|----------|
| Jonas Brandt (`prac_02`) | Mitte | KG, MT | 09:20–09:40, 11:40–12:00, 15:00–15:20 | 60 |
| Sofia Lindqvist (`prac_04`) | Mitte | KG, KGG | 10:20–10:40, 16:00–16:20 | 40 |
| Meltem Aydin (`prac_05`) | Kreuzberg | KG, MT, MLD45 | none (08:00–16:00 fully booked) | 0 |
| David Okafor (`prac_06`) | Kreuzberg | KG | 12:00–12:20, 15:20–15:40, 17:20–17:40 | 60 |
| Tobias Falk (`prac_08`) | Kreuzberg | KG, KGG | 08:40–09:00, 13:00–13:20 | 40 |
| Clara Petersen (`prac_07`) | Mitte | KG, MT | not working Mondays | — |

Demand: 9 × 20 min at Mitte in the morning (6 KG, 3 MT) and 5 at Kreuzberg in the afternoon (3 KG, 1 MT, 1 MLD45 × 40 min). Supply that matches location, qualification, and a gap ≥ duration: **MT** — Brandt only, 3 gaps; **MLD45** — nobody; **KG** — 2 gaps Mitte + 5 gaps Kreuzberg, but the Kreuzberg gaps are mostly outside the patients' booked afternoon times. Realistic same-day rebooking is a handful, not 14.

Anna's own week (Tue–Fri) is booked to the minute, and four of today's patients have their next slot with Anna this week too (F13) — so the tool must handle "Anna is out for several days" as the likely follow-up, not a corner case.
