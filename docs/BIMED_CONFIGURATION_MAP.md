# Bimed Recruitment Portal Configuration Map

This note maps the current MVP to the Bimed brief and isolates the pieces that should remain configurable until Bimed confirms them.

## What the repo already covers

- Invitation-only candidate access via private token links.
- Token hashing in the database.
- Multi-step candidate application.
- Ireland vs international branching in the form.
- No document upload flow.
- Separate supporting-document email instructions.
- Basic admin password gate.
- Supabase persistence.
- Candidate confirmation and internal notification emails.

Relevant files:

- [app/api/applications/route.ts](/D:/BIMED/bimed-recruitment-portal/app/api/applications/route.ts)
- [app/api/admin/invites/route.ts](/D:/BIMED/bimed-recruitment-portal/app/api/admin/invites/route.ts)
- [app/api/admin/applications/route.ts](/D:/BIMED/bimed-recruitment-portal/app/api/admin/applications/route.ts)
- [components/CandidateForm.tsx](/D:/BIMED/bimed-recruitment-portal/components/CandidateForm.tsx)
- [lib/email.ts](/D:/BIMED/bimed-recruitment-portal/lib/email.ts)
- [supabase/schema.sql](/D:/BIMED/bimed-recruitment-portal/supabase/schema.sql)

## Bimed-specific information still required

These are the decisions and inputs that should come from Bimed before they are hard-coded into the product.

### 1. Company identity and contacts

- Full legal company name.
- Registered address.
- Company registration number.
- Official recruitment contact details.
- Named contact for Ireland-based applicants.
- Named contact for overseas applicants.
- Authorised signatory details.
- Confirmed sender identity for transactional email.

### 2. Roles and eligibility

- Exact job titles currently being recruited.
- Role descriptions and duties.
- Required qualifications and experience.
- Minimum eligibility requirements.
- Any role-specific screening criteria.

### 3. Employment terms

- Salary or hourly rate.
- Contracted hours.
- Shift patterns.
- Overtime rules.
- Pay frequency.
- Probation period.
- Annual leave.
- Notice periods.
- Benefits.
- Any role-specific or contract-specific conditions.

### 4. Recruitment workflow

- The intended end-to-end sequence from CV submission to onboarding.
- Which application statuses Bimed wants exposed in the dashboard.
- Whether all statuses should be available or only a subset.
- Whether notes are required on candidate records.

### 5. Interview and assessment

- Existing interview questions.
- Scoring criteria.
- Assessment procedure.
- Any stage-gate logic that should affect dashboard status changes.

### 6. Overseas recruitment and permit handling

- Which roles may be recruited internationally.
- Whether Bimed sponsors eligible candidates.
- Who manages permit and visa processing.
- Whether Bimed uses an external adviser.
- Which costs are covered by Bimed versus the candidate.
- The exact wording to use for immigration-related guidance.

### 7. Supporting documents

- Required documents for Ireland-based candidates.
- Required documents for overseas candidates.
- Any pathway-specific checklist differences.
- Whether Garda vetting, police clearance, or background checks are required for specific roles.

### 8. Relocation and reimbursement

- Whether the current relocation reimbursement idea is real policy or placeholder wording.
- Eligible expenses.
- Maximum amounts.
- Definition of "family of three".
- Evidence or receipt requirements.
- Approval process.
- Any conditions attached.

### 9. GDPR and privacy

- Privacy notice.
- Recruitment privacy statement.
- Data-retention requirements.
- Consent wording approved by Bimed.
- Any legal or HR copy that must replace the MVP text.

### 10. Dashboard access and notification routing

- Which recruitment personnel should receive application notifications.
- Who should have dashboard access.
- Whether admin access stays password-based for MVP or moves to proper authentication now.

### 11. Email content

- Final candidate confirmation copy.
- Final internal notification copy.
- Whether the notification email should include a direct link to the admin record.
- Whether subject lines or templates need Bimed approval.

## What should stay configurable

These should be driven from config, database rows, or editable templates instead of being hard-coded.

- Role list.
- Status list.
- Support-document checklist.
- Ireland vs international routing emails.
- Candidate confirmation email template.
- Internal notification email template.
- Recruitment process text shown in the portal.
- Immigration caution text.
- Relocation/reimbursement wording.
- Dashboard status labels.

## Likely build next

When we start implementing, the safest order is:

1. Move role and status data into configuration.
2. Add candidate detail views and editable status updates.
3. Expand the application data model to match the brief.
4. Replace the temporary admin password flow with proper authentication later.
5. Keep all Bimed-specific wording editable until Bimed confirms it.

