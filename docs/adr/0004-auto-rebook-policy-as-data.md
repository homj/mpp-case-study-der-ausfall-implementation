---
status: accepted
date: 2026-08-19
---
# The auto-rebook policy is a data structure in the domain package, not scattered conditions

Which affected appointments the engine may rebook without asking is a product rule that will change (the ±2-day window is an explicit guess). The policy lives as one typed value (`AutoRebookPolicy`: same location required, max day offset, qualification match, contactable patient, gap ≥ duration) interpreted by one function, with tests that pin the current values. Changing the rule means changing data and a test, not hunting code paths. The same holds for the priority ranking (one sort function).
