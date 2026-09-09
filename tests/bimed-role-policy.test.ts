import { describe, expect, it } from 'vitest';
import { getContractTemplate } from '@/lib/contract-templates';
import { getJobDescriptionTemplate } from '@/lib/document-templates';
import {
  BIMED_DEFAULT_LINE_MANAGER,
  BIMED_DEFAULT_PAY_FREQUENCY,
  BIMED_DEFAULT_PROBATION,
  BIMED_DEFAULT_START_DATE,
  applyBimedContractDefaults,
  CANONICAL_RECRUITMENT_ROLES,
  normalizeRecruitmentRole,
  recruitmentRoleSlug,
} from '@/lib/bimed-role-policy';

describe('BIMED role policy', () => {
  it('normalizes supported and legacy recruitment role labels', () => {
    expect(normalizeRecruitmentRole('Support Worker')).toBe('Support Worker');
    expect(normalizeRecruitmentRole('Senior Support Worker')).toBe('Senior Support Worker');
    expect(normalizeRecruitmentRole('Physiotherapist')).toBe('Physiotherapist');
    expect(normalizeRecruitmentRole('Healthcare Worker')).toBe('Healthcare Assistant');
    expect(normalizeRecruitmentRole('Other')).toBeNull();
    expect([...CANONICAL_RECRUITMENT_ROLES]).toEqual([
      'Support Worker',
      'Healthcare Assistant',
      'Senior Support Worker',
      'Physiotherapist',
    ]);
  });

  it('maps every canonical recruitment role to a matching contract and job description', () => {
    for (const role of CANONICAL_RECRUITMENT_ROLES) {
      const slug = recruitmentRoleSlug(role);
      expect(slug).toBeTruthy();
      expect(getContractTemplate(slug!)).toMatchObject({ roleSlug: slug, roleLabel: role });
      expect(getJobDescriptionTemplate(slug!)).toMatchObject({ slug, roleLabel: role });
    }

    expect(recruitmentRoleSlug('not-a-bimed-role')).toBeNull();
  });

  it('applies common contract defaults without changing role-specific terms', () => {
    const template = getContractTemplate('healthcare-assistant');
    if (!template) throw new Error('Healthcare Assistant template missing');

    const resolved = applyBimedContractDefaults(template);
    const field = (label: string) => resolved.editableFields.find((item) => item.label === label)?.value;
    const probation = resolved.sections.find((section) => section.heading === '2. Commencement of Employment and Probation')?.paragraphs.join('\n') || '';

    expect(field('Line manager')).toBe(BIMED_DEFAULT_LINE_MANAGER);
    expect(field('Start date')).toBe(BIMED_DEFAULT_START_DATE);
    expect(field('Pay frequency')).toBe(BIMED_DEFAULT_PAY_FREQUENCY);
    expect(probation).toContain(`first ${BIMED_DEFAULT_PROBATION}`);
    expect(probation).toContain('combined maximum of 6 months');
    expect(probation).not.toContain('first 6 months of your employment');
    expect(field('Contracted hours')).toBe('39 hours per week');
    expect(field('Pay')).toContain('EUR 32,691');
  });

  it('preserves Physiotherapist-specific hours, pay and registration requirements', () => {
    const template = getContractTemplate('physiotherapist');
    if (!template) throw new Error('Physiotherapist template missing');

    const resolved = applyBimedContractDefaults(template);
    const field = (label: string) => resolved.editableFields.find((item) => item.label === label)?.value;

    expect(field('Contracted hours')).toBe('35 hours per week');
    expect(field('Pay')).toContain('EUR 45,514');
    expect(resolved.sections.find((section) => section.heading === '16. Right to Work')?.paragraphs.join('\n')).toContain('CORU');
  });
});
