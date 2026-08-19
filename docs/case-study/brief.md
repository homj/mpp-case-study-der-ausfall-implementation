# Case study brief: "The Outage" (Der Ausfall)

English translation of the assignment. The assignment was given in German; this is the working version for this repo. Data source: <https://github.com/meinphysioplus/case-study-der-ausfall> (our copy lives in `data/`, see `data/README.md`).

## Starting point

meinphysio+ runs physiotherapy practices in Berlin. For this case the setup is simplified to **two locations**. Treatment is given on the basis of **medical prescriptions** (Verordnungen). Booking happens in **Termino** (fictional), an external booking tool. Termino provides us with a **complete export of all appointments every 5 minutes**. We keep **patient master data and prescriptions** ourselves.

All data is in `data/` (see `data/README.md`).

## The incident

Monday, 7 September 2026, 07:40. Physiotherapist **Anna Weber** calls in sick. She has **14 appointments** with patients today at **both locations**; the first starts at **08:00**. The front desk must now decide: **who gets rebooked, who gets cancelled, and who is informed, and how?**

## Your task

Build a **service with a user interface** that takes these decisions off the front desk's hands, or speeds them up a lot.

Decide for yourself what you consider important. **We assess judgement above all, not volume.**

## Constraints

- **TypeScript, PostgreSQL, frontend in React.** You choose frameworks and libraries; justify the choice in the README.
- The project starts with **one command**, for example `docker compose up`.
- **Maximum 3 hours.** Not finished is okay. Write down where you stopped.

## What we do not expect

- Authentication or user management
- Full test coverage
- Deployment or CI
- Full error handling
