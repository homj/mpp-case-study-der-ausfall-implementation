# Case study "The Outage": data

English translation of the data README from <https://github.com/meinphysioplus/case-study-der-ausfall>. The JSON files are the original source data and keep their German field names; see the glossary in `CONTEXT.md` for the English terms we use in code.

All persons and data are fictional.

## Files

### `praxen.json` — locations

Our two locations.

| Field | Meaning |
| --- | --- |
| `id` | internal ID |
| `name`, `adresse` | location name and address |
| `termino_location_id` | ID of the location in Termino, our booking tool |

### `therapeuten.json` — practitioners

Our team.

| Field | Meaning |
| --- | --- |
| `id` | internal ID |
| `vorname`, `nachname` | first name, last name |
| `qualifikationen` | services the person may deliver: `KG` (physiotherapy / remedial gymnastics), `MT` (manual therapy), `MLD45` (manual lymphatic drainage, 45 min), `KGG` (device-supported physiotherapy) |
| `arbeitszeiten` | working intervals per weekday (`mo` to `fr`); breaks are left out. `praxis_id` refers to `praxen.json` |
| `termino_practitioner_id` | ID of the person in Termino |

### `patienten.json` — patients

Patient master data from our own administration.

| Field | Meaning |
| --- | --- |
| `id` | internal ID |
| `vorname`, `nachname`, `geburtsdatum` | person (first name, last name, date of birth) |
| `telefon`, `email` | contact data, where available |
| `termino_patient_id` | ID of the patient record in Termino, if linked |

### `verordnungen.json` — prescriptions

Medical prescriptions for therapeutic services (Heilmittelverordnungen), on which treatment is based.

| Field | Meaning |
| --- | --- |
| `id` | internal ID |
| `patient_id` | refers to `patienten.json` |
| `ausstellungsdatum` | date the doctor issued the prescription |
| `diagnosegruppe` | diagnosis group per prescription |
| `heilmittel` | prescribed service (codes as above) |
| `verordnungsmenge` | number of prescribed treatment units |
| `frequenz_pro_woche` | recommended treatment frequency per week |

### `termino_export_2026-09-07_0800.json` and `..._0805.json` — appointment exports

Booking happens in Termino, an external booking tool. Every 5 minutes Termino provides a complete export of all appointments in a window from two weeks back to one week ahead. These are the two exports from the morning of 7 September 2026.

Structure per appointment:

| Field | Meaning |
| --- | --- |
| `id` | appointment ID in Termino |
| `location_id`, `practitioner_id` | location and treating person (Termino IDs) |
| `service` | booked service (Termino label) |
| `starts_at`, `duration_min` | start and duration |
| `status` | `booked` or `cancelled` |
| `patient` | patient record as Termino keeps it (`id`, `name`, `birth_date`, `phone`, `email`) |
| `booked_at`, `updated_at` | booking time and last change time |
