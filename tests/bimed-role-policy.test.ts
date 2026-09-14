import { describe, expect, it } from 'vitest';
import { getContractTemplate } from '@/lib/contract-templates';
import { getJobDescriptionTemplate } from '@/lib/document-templates';
import {
  BIMED_DEFAULT_LINE_MANAGER,
  BIMED_DEFAULT_PAY_FREQUENCY,
  BIMED_DEFAULT_PROBATION,
  BIMED_DEFAULT_START_DATE,
  applyBimedContractDefaults,
  applyBimedJobDescriptionDefaults,
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
    const schedule2 = resolved.schedules.find((section) => section.heading === 'Schedule 2 - Job Description')?.paragraphs.join('\n') || '';
    const allContractText = [
      ...resolved.editableFields.map((item) => item.value),
      ...resolved.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      ...resolved.schedules.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      resolved.closingNote,
    ].join('\n');

    expect(field('Line manager')).toBe(BIMED_DEFAULT_LINE_MANAGER);
    expect(field('Start date')).toBe(BIMED_DEFAULT_START_DATE);
    expect(field('Pay frequency')).toBe(BIMED_DEFAULT_PAY_FREQUENCY);
    expect(probation).toContain(`first ${BIMED_DEFAULT_PROBATION}`);
    expect(probation).toContain('combined maximum of 6 months');
    expect(probation).not.toContain('first 6 months of your employment');
    expect(field('Contracted hours')).toBe('39 hours per week');
    expect(field('Pay')).toContain('EUR 32,691');
    expect(schedule2).toContain('Job title: Healthcare Assistant');
    expect(schedule2).toContain(`Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`);
    expect(schedule2).not.toContain('[insert]');
    expect(allContractText).not.toMatch(/\[[^\]]+\]/);
  });

  it('resolves employee-specific placeholders when preparing a candidate contract', () => {
    const template = getContractTemplate('support-worker');
    if (!template) throw new Error('Support Worker template missing');

    const resolved = applyBimedContractDefaults(template, {
      employeeName: 'Gabriel Oliveira de Lima',
      employeeAddress: 'Example residential address, Dublin',
      startDate: '2027-01-11',
    });
    const allContractText = [
      ...resolved.editableFields.map((item) => item.value),
      ...resolved.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      ...resolved.schedules.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      resolved.closingNote,
    ].join('\n');

    expect(allContractText).toContain('Gabriel Oliveira de Lima');
    expect(allContractText).toContain('Example residential address, Dublin');
    expect(allContractText).toContain('11 January 2027');
    expect(allContractText).not.toMatch(/\[[^\]]+\]/);
  });

  it('resolves the reporting line in job descriptions', () => {
    const template = getJobDescriptionTemplate('healthcare-assistant');
    if (!template) throw new Error('Healthcare Assistant job description missing');

    const resolved = applyBimedJobDescriptionDefaults(template);
    const roleSummary = resolved.sections.find((section) => section.heading === 'Role Summary');
    expect(roleSummary?.paragraphs).toContain(`Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`);
    expect(roleSummary?.paragraphs.join('\n')).not.toContain('[Insert line manager name/title]');
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
