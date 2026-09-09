# BIMED Recruitment Role Consistency Plan

This document records the canonical role model for recruitment and downstream employment documents.

## Canonical roles
- Support Worker (`support-worker`)
- Healthcare Assistant (`healthcare-assistant`)
- Senior Support Worker (`senior-support-worker`)
- Physiotherapist (`physiotherapist`)

## Rules
1. A candidate's invited/applied role must resolve to exactly one canonical role slug.
2. The same canonical role must drive interview questions, job description, contract, offer/onboarding and staff records.
3. `Other` is not a normal candidate-selectable role because there is no controlled contractual/document package for it.
4. `Healthcare Worker` is not a separate canonical role; where this label appears in legacy data it must be normalized explicitly rather than silently creating a second role.
5. Employee address is sourced from the existing application record for contract prefill.
6. Contract defaults: line manager `Dezou Maurice`, start date `11 January 2027`, probation `3 months`, pay frequency `monthly`.
7. Role-specific hours, salary, professional registration and duties remain role-specific and must not be overwritten by generic defaults.
8. The Employee Handbook remains the common employment-policy document. Role-specific professional requirements belong in the role Job Description and Contract.
