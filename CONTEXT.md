# Context: ubiquitous language

This is the glossary for this project. It is the only place where German appears in the codebase. Everywhere else — code, identifiers, comments, docs, commits, issues — use the English term from this table.

Rules:

- Add a row when you meet a German domain term in source material (case study, data, requirements).
- Pick one English term per concept and use it everywhere. Do not drift to synonyms.
- If a German term has no clean English equivalent, keep the German word as the English identifier, mark it in the row, and explain it.
- Keep rows sorted by German term.

| German term | English term (use this in code) | Explanation |
| ----------- | ------------------------------- | ----------- |
| Absage / absagen | cancellation / cancel | Cancelling an appointment. The patient is not treated and needs to be informed. |
| Arbeitszeiten | working hours | A practitioner's working intervals per weekday and location; breaks are left out. Field in `therapeuten.json`. |
| Abwesenheit / Ausfall | absence | A period with start and end **date-time** during which a practitioner cannot treat. Has a practitioner, a category, and an optional note. "Ausfall" (the case study title) is an absence too. Avoid: outage, sick leave, unavailability. |
| Abwesenheitskategorie | absence category | Why the practitioner is absent: `sick`, `emergency`, `planned` (vacation, training), `other`. Informational; does not change how the engine decides. |
| Betroffener Termin | affected appointment | A booked appointment of the absent practitioner whose time span overlaps the absence period. The unit the engine decides on. An appointment already running when the absence starts is flagged **in progress**; it is handled in person at the practice and gets a resolution like any other. |
| Ausstellungsdatum | issue date | Date on which the doctor issued the prescription. |
| Behandlung / Behandlungseinheit | treatment / treatment unit | One session under a prescription. A prescription grants a number of units. |
| Diagnosegruppe | diagnosis group | Diagnosis group code on the prescription. |
| DSGVO (Datenschutz-Grundverordnung) | GDPR | EU General Data Protection Regulation. Governs how we collect, store, process, export, and delete personal data. Use "GDPR" in code and docs. |
| Empfang | front desk | Reception staff who handle rebooking, cancellations, and patient contact. Our primary user. Do not use "reception" as the identifier; use `frontDesk`. |
| Frequenz pro Woche | frequency per week | Recommended number of treatments per week on a prescription. |
| Heilmittel | therapeutic service | A prescribed service type. Codes: `KG`, `MT`, `MLD45`, `KGG`. Keep the codes as-is in code. |
| Heilmittelverordnung | prescription | See Verordnung. |
| KG (Krankengymnastik) | KG — physiotherapy (remedial gymnastics) | Service code. Keep `KG` as the identifier. |
| KGG (gerätegestützte Krankengymnastik) | KGG — device-supported physiotherapy | Service code. Keep `KGG` as the identifier. |
| MLD45 (Manuelle Lymphdrainage, 45 Min.) | MLD45 — manual lymphatic drainage, 45 min | Service code. Keep `MLD45` as the identifier. |
| MT (Manuelle Therapie) | MT — manual therapy | Service code. Keep `MT` as the identifier. |
| Patient:in | patient | Person receiving treatment. We hold master data; Termino holds its own copy. |
| Nicht zugeordnete:r Patient:in | unmatched patient | A patient record from Termino with no confirmed link to our master data (no `termino_patient_id` match, or only a fuzzy candidate). Treated as self-payer until the front desk resolves the match. Avoid: unknown patient, unlinked patient. |
| Patientenstammdaten | patient master data | Our own patient records (`patienten.json`), as opposed to the patient copy inside Termino exports. |
| Physiotherapeut:in / Therapeut:in | practitioner | Treating person. Matches the Termino data (`practitioner_id`). Use `practitioner` everywhere; do not use "therapist". |
| Praxis / Standort | practice / location | One physical site. The case has two. The tenant in the multi-practice vision is the practice group; a location is one site under it. |
| Qualifikationen | qualifications | Service codes a practitioner may deliver. |
| Schnellaktion | quick action | A one-click action the tool offers. Appointment-scoped: `accept_proposal`, `cancel_and_notify`, `rebooked_manually`. Task-scoped: `log_contact_attempt`. Data issues have their own actions (`resolve_patient_match`). The front desk confirms by clicking; the tool executes. |
| Selbstzahler | self-payer | Patient who pays for treatment directly, without a prescription billed to an insurer. We assume this for patients who exist only in Termino with no prescription on file, and surface it as a data gap. |
| Termin | appointment | A booked slot in Termino. Status `booked` or `cancelled`. |
| Termino | Termino | Fictional external booking tool. Proper noun, keep as-is. |
| Umbuchung / umbuchen | rebooking / rebook | Moving an appointment to another practitioner, time, or location. |
| Datenproblem | data issue | A record the tool cannot reconcile with our data and that the front desk must resolve: an unmatched patient, a fuzzy match candidate, an unknown practitioner ID in an export. A data-consistency chore, separate from rescheduling. |
| Ergebnis (eines Termins) | resolution | What finally happened to an affected appointment: `rebooked` (new slot), `swapped` (same slot, other practitioner), `cancelled` (no replacement yet), `kept` (practitioner available after all), `completed` (in-progress treatment finished), `aborted` (in-progress treatment stopped; the front desk then picks a follow-up: *needs rescheduling* — the appointment re-enters the engine — or *no follow-up* with a note, for example partial refund), `resolved_externally` (changed or cancelled in Termino outside this tool). |
| Kontaktversuch | contact attempt | One try by the front desk to reach a patient by phone. Counted on the reschedule task; failed attempts put the task into `retry_contact`. |
| Postausgang | outbox | Persisted record of every notification and every Termino write the tool intends to make, with delivery status. Nothing is sent or written without an outbox row. |
| Termino-Schreibvorgang | Termino write | An intended change in Termino (rebook, swap, cancel, block practitioner) recorded in the outbox, delivered through the Termino adapter with retries, and confirmed by a later export. States: `pending`, `delivered`, `confirmed`, `failed`. |
| Umbuchungsaufgabe | reschedule task | The unit of work for the front desk: one per patient per absence, bundling that patient's affected appointments, with a status (`open`, `in_progress`, `retry_contact`, `resolved`) and a contact-attempt count. Avoid: work item, case, ticket. |
| Abgleich | reconciliation | Comparing a new Termino export against pending Termino writes and open reschedule tasks: confirm delivered writes, flag taken slots, close tasks resolved externally, create tasks for new bookings inside an absence. |
| Vorschlag | proposal | A candidate resolution the engine suggests for an affected appointment but does not execute (for example a cross-location slot or a slot outside the auto-rebook window). Accepted by a quick action. |
| Sperre (Praktiker:in) | practitioner block | A Termino write that stops new bookings for a practitioner during an absence. Issued as soon as an absence is recorded. |
| Verordnung | prescription | Medical prescription for therapeutic services; the basis for treatment. Has an issue date, diagnosis group, service code, number of units, and frequency per week. |
| Verordnungsmenge | prescribed units | Number of treatment units granted by a prescription. |

## Notes on terms to avoid

Synonyms we explicitly do not use, and the term to use instead.

- "therapist" → use **practitioner** (matches `practitioner_id` in the Termino data).
- "reception" / "receptionist" → use **front desk**.
- "outage", "sick leave" → use **absence** (with a category).
- "unknown patient", "unlinked patient" → use **unmatched patient**.
- "work item", "case", "ticket" → use **reschedule task**.
- "exception" (as a noun for a task) → say **open reschedule task**.
