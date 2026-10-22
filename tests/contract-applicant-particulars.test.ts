import { describe, expect, it } from 'vitest';
import { getSocClassification, isAdultAtEmploymentStart } from '@/lib/soc-classification';
import { applyContractOverrides, getContractTemplate } from '@/lib/contract-templates';

describe('SOC classification and required applicant contract particulars', () => {
  it('maps Physiotherapist from the application role to the Irish SOC 2010 code', () => {
    const classification = getSocClassification('Physiotherapist');
    expect(classification?.code).toBe('2221');
    expect(classification?.display).toBe('SOC 2010 2221 — Physiotherapist');
    expect(classification?.sourceUrl).toContain('enterprise.gov.ie');
  });

  it('maps the other canonical BIMED recruitment roles to explicit SOC 2010 labels', () => {
    expect(getSocClassification('Healthcare Assistant')?.code).toBe('6141');
    expect(getSocClassification('Support Worker')?.code).toBe('3239');
    expect(getSocClassification('Senior Support Worker')?.code).toBe('6146');
    expect(getSocClassification('Unmapped role')).toBeNull();
  });

  it('validates date of birth against the planned employment start date', () => {
    expect(isAdultAtEmploymentStart('1999-08-12', '2027-01-11')).toBe(true);
    expect(isAdultAtEmploymentStart('2026-09-14', '2027-01-11')).toBe(false);
    expect(isAdultAtEmploymentStart(null, '2027-01-11')).toBe(false);
    expect(isAdultAtEmploymentStart('not-a-date', '2027-01-11')).toBe(false);
  });

  it('populates DOB, nationality and SOC in the contract from application details', () => {
    const template = getContractTemplate('physiotherapist');
    expect(template).not.toBeNull();
    const rendered = applyContractOverrides(template!, {
      employeeName: 'Applicant Example',
      dateOfBirth: '12 August 1999',
      nationality: 'Indian',
      socClassification: 'SOC 2010 2221 — Physiotherapist',
      socClassificationNote: 'Matched to the applied role against the official DETE list.',
    });
    const values = Object.fromEntries(rendered.editableFields.map((field) => [field.label, field.value]));
    expect(values['Date of birth']).toBe('12 August 1999');
    expect(values.Nationality).toBe('Indian');
    expect(values['SOC / occupation classification']).toBe('SOC 2010 2221 — Physiotherapist');
    expect(rendered.editableFields.find((field) => field.label === 'SOC / occupation classification')?.note)
      .toContain('official DETE list');
  });

  it('keeps the accommodation timing and data checks in the issue paths', async () => {
    const { readFile } = await import('node:fs/promises');
    const resolver = await readFile('lib/bimed-staff-contract.ts', 'utf8');
    const onboarding = await readFile('app/api/admin/applications/[id]/onboarding-pack/route.ts', 'utf8');
    const policy = await readFile('lib/bimed-role-policy.ts', 'utf8');
    expect(resolver).toContain('1 January 2027');
    expect(resolver).toContain('31 January 2027');
    expect(resolver).toContain('1 February 2027');
    expect(resolver).toContain('Date of birth is missing from the recruitment application');
    expect(resolver).toContain('Nationality is missing from the recruitment application');
    expect(onboarding).toContain('isAdultAtEmploymentStart(currentApplication.date_of_birth');
    expect(onboarding).toContain('getSocClassification(currentApplication.role_applied)');
    expect(policy).toContain('From 1 February 2027, you must arrange your own accommodation');
  });
});
