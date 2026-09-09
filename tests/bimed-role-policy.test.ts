import { describe, expect, it } from 'vitest';
import { getContractTemplate } from '@/lib/contract-templates';
import {
  BIMED_DEFAULT_LINE_MANAGER,
  BIMED_DEFAULT_PAY_FREQUENCY,
  BIMED_DEFAULT_PROBATION,
  BIMED_DEFAULT_START_DATE,
  applyBimedContractDefaults,
  normalizeRecruitmentRole,
} from '@/lib/bimed-role-policy';

describe('BIMED role policy', () => {
  it('normalizes supported and legacy recruitment role labels', () => {
    expect(normalizeRecruitmentRole('Support Worker')).toBe('Support Worker');
    expect(normalizeRecruitmentRole('Senior Support Worker')).toBe('Senior Support Worker');
    expect(normalizeRecruitmentRole('Physiotherapist')).toBe('Physiotherapist');
    expect(normalizeRecruitmentRole('Healthcare Worker')).toBe('Healthcare Assistant');
    expect(normalizeRecruitmentRole('Other')).toBeNull();
  });

  it('applies common contract defaults without changing role-specific terms', () => {
    const template = getContractTemplate('healthcare-assistant');
    if (!template) throw new Error('Healthcare Assistant template missing');

    const resolved = applyBimedContractDefaults(template);
    const field = (label: string) => resolved.editableFields.find((item) => item.label === label)?.value;

    expect(field('Line manager')).toBe(BIMED_DEFAULT_LINE_MANAGER);
    expect(field('Start date')).toBe(BIMED_DEFAULT_START_DATE);
    expect(field('Pay frequency')).toBe(BIMED_DEFAULT_PAY_FREQUENCY);
    expect(resolved.sections.find((section) => section.heading === '2. Commencement of Employment and Probation')?.paragraphs.join('\n')).toContain(`first ${BIMED_DEFAULT_PROBATION}`);
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
