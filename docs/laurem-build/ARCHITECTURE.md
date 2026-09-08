# Laurem Recruitment & Workforce Platform

## Build target

Create a complete Laurem Caregroup recruitment and workforce platform using the existing BIMED platform as the proven technical reference. BIMED production remains isolated. This branch is a staging extraction point until a dedicated Laurem repository is created.

## Product layers

1. **Core recruitment engine**
   - private invitations
   - guided applications with autosave
   - application pipeline
   - configurable vacancies
   - configurable interview templates
   - candidate communications
   - document packets
   - offers and onboarding
   - audit trail

2. **Care recruitment module**
   - UK/local recruitment pathway
   - international recruitment pathway
   - nursing credentials and registration fields
   - right-to-work
   - DBS and training
   - professional and character references
   - sponsorship workflow
   - onboarding compliance

3. **Workforce module**
   - staff identity
   - staff portal
   - rota
   - shift requests/swaps
   - leave
   - attendance
   - payslips
   - staff documents
   - notifications

4. **Company configuration**
   - Laurem branding
   - company profile
   - locations
   - recruitment contacts
   - vacancy catalogue
   - job descriptions
   - interview questions
   - candidate document requirements
   - offer/contract templates
   - onboarding content

## Laurem recruitment pathways

### UK nurse
Application and interview pathway for candidates already living/working in the UK. Collect right-to-work status and UK practice experience.

### International nurse
Application and interview pathway for nurses outside the UK. Collect current country, professional registration status, UK registration progress, relocation readiness, dependants, sponsorship context and supporting evidence. Sponsorship remains subject to Laurem's eligibility and compliance review and must not be presented by the software as an automatic entitlement.

### Other care roles
The existing Laurem Senior Support Worker material remains the source for role-specific content. The historical interview document contains 16 questions covering motivation, care experience, safeguarding, medication refusal, driving, teamwork, communication and personal circumstances.

## Interview architecture

Interview content must not be hard-coded into the candidate UI. The engine should resolve a template from:

`company -> role -> pathway -> interview stage`

Each question supports:
- stable ID
- text
- category
- optional candidate guidance
- response type: text/audio/structured
- required flag
- optional scoring rubric

Recommended stages:

1. application screening
2. first interview
3. asynchronous/audio screening where configured
4. second interview with practical/safeguarding scenarios
5. recruiter decision

## Nurse interview programme

The Laurem nurse programme added in `lib/companies/laurem/interview-questions.ts` contains:
- common nurse competency questions
- UK pathway questions
- international pathway questions
- audio screening questions
- second-interview clinical/safeguarding scenarios

The source Laurem application form already captures NMC/RCN information, DBS, mandatory training, two professional referees, character references, education, work history, employment gaps, declarations and right-to-work information. The sponsorship application form adds passport, immigration, travel history, accommodation, criminal/penalty history, medical treatment, work and sponsorship details.

## White-label direction

Do not copy BIMED company constants into Laurem logic. Replace company-specific assumptions with configuration interfaces. Future tenants should be instantiated from the same engine using their own:

- identity and branding
- recruitment contacts
- roles and locations
- interview templates
- document templates
- compliance checklists
- workflow switches

The immediate Laurem implementation may live beside the existing BIMED code during extraction, but the final product should be moved to a dedicated repository before production deployment.
