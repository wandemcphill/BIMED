# BIMED Candidate Document Pack Routing Matrix

## Purpose

This matrix is the single operational reference for which candidate-facing documents are issued at each recruitment stage.

### Standard application stage
Issued after shortlist/private invitation:
- Role Information Pack
- Interview Questionnaire
- Candidate Application Guide
- Supporting Documents Checklist

### Offer stage: Ireland-based candidate
Issued after BIMED approves the offer:
- Employment Contract
- Role-specific Job Description
- Care in Ireland Handbook
- New Starter Onboarding Checklist

### Offer stage: International candidate
Issued after BIMED approves the offer and relocation pathway:
- Employment Contract
- Role-specific Job Description
- Care in Ireland Handbook
- International Recruitment & Visa Sponsorship Pack
- Welcome to Ireland Pack
- International Relocation & First-Month Checklist
- New Starter Onboarding Checklist

## Routing rule

The international branch is selected from the candidate's explicit `living_in_ireland === 'No'` answer. Completion of the international questions is required before the application is submitted, but routing does not depend on residence fields being complete.

## Controlled-document rule

A document is a candidate-facing source template until BIMED approves its content for production. The portal must never imply that BIMED guarantees an immigration, employment-permit, visa, tax, housing, or other government outcome.

## Delivery rule

The portal should issue the pack through private, candidate-specific links generated server-side. Internal automation uses the BIMED monitoring inbox; normal recruitment correspondence remains on the appropriate Ireland/overseas recruitment mailbox.
