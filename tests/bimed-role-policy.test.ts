import { describe, expect, it } from 'vitest';
import { getContractTemplate } from '@/lib/contract-templates';
import { getJobDescriptionTemplate } from '@/lib/document-templates';
import {
  BIMED_DEFAULT_CONTRACT_DURATION,
  BIMED_DEFAULT_LINE_MANAGER,
  BIMED_DEFAULT_PAY_FREQUENCY,
  BIMED_DEFAULT_PROBATION,
  BIMED_DEFAULT_START_DATE,
  BIMED_ROLE_SALARIES,
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

  it('keeps the canonical role salaries unchanged', () => {
    expect(BIMED_ROLE_SALARIES).toEqual({
      'support-worker': '€36,000 per annum',
      'healthcare-assistant': '€36,000 per annum',
      'senior-support-worker': '€41,000 per annum',
      physiotherapist: '€55,000 per annum',
    });
  });

  it('removes unresolved placeholders from every canonical contract after applying BIMED defaults', () => {
    for (const role of CANONICAL_RECRUITMENT_ROLES) {
      const slug = recruitmentRoleSlug(role)!;
      const template = getContractTemplate(slug);
      if (!template) throw new Error(`${role} template missing`);

      const resolved = applyBimedContractDefaults(template);
      const allContractText = [
        ...resolved.editableFields.map((item) => item.value),
        ...resolved.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
        ...resolved.schedules.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
        resolved.closingNote,
      ].join('\n');

      expect(allContractText).not.toMatch(/\[[^\]]+\]/);
      expect(allContractText).toContain(`Job title: ${role}`);
      expect(allContractText).toContain(`Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`);
      expect(resolved.editableFields.find((item) => item.label === 'Start date')?.value).toBe(BIMED_DEFAULT_START_DATE);
      expect(resolved.editableFields.find((item) => item.label === 'Pay frequency')?.value).toBe(BIMED_DEFAULT_PAY_FREQUENCY);
      expect(resolved.editableFields.find((item) => item.label === 'Pay')?.value).toBe(BIMED_ROLE_SALARIES[slug]);
      expect(resolved.editableFields.find((item) => item.label === 'Contract duration')?.value).toBe(BIMED_DEFAULT_CONTRACT_DURATION);
      expect(resolved.sections.find((section) => section.heading === '2. Commencement of Employment and Probation')?.paragraphs.join('\n')).toContain(`2.6 Contract duration: ${BIMED_DEFAULT_CONTRACT_DURATION}`);
    }
  });

  it('applies common contract defaults without changing role-specific terms', () => {
    const template = getContractTemplate('healthcare-assistant');
    if (!template) throw new Error('Healthcare Assistant template missing');

    const resolved = applyBimedContractDefaults(template);
    const field = (label: string) => resolved.editableFields.find((item) => item.label === label)?.value;
    const probation = resolved.sections.find((section) => section.heading === '2. Commencement of Employment and Probation')?.paragraphs.join('\n') || '';
    const schedule2 = resolved.schedules.find((section) => section.heading === 'Schedule 2 - Job Description')?.paragraphs.join('\n') || '';

    expect(field('Line manager')).toBe(BIMED_DEFAULT_LINE_MANAGER);
    expect(field('Start date')).toBe(BIMED_DEFAULT_START_DATE);
    expect(field('Pay frequency')).toBe(BIMED_DEFAULT_PAY_FREQUENCY);
    expect(field('Contract duration')).toBe(BIMED_DEFAULT_CONTRACT_DURATION);
    expect(probation).toContain(`first ${BIMED_DEFAULT_PROBATION}`);
    expect(probation).toContain('combined maximum of 6 months');
    expect(probation).not.toContain('first 6 months of your employment');
    expect(field('Contracted hours')).toBe('39 hours per week');
    expect(field('Pay')).toBe(BIMED_ROLE_SALARIES['healthcare-assistant']);
    expect(schedule2).toContain('Job title: Healthcare Assistant');
    expect(schedule2).toContain(`Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`);
    expect(schedule2).not.toContain('[insert]');
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
    expect(allContractText).toContain(BIMED_DEFAULT_CONTRACT_DURATION);
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

  it('states the intended Critical Skills permit pathway and canonical terms for Physiotherapist', () => {
    const template = getContractTemplate('physiotherapist');
    if (!template) throw new Error('Physiotherapist template missing');

    const resolved = applyBimedContractDefaults(template);
    const field = (label: string) => resolved.editableFields.find((item) => item.label === label)?.value;
    const allContractText = [
      ...resolved.editableFields.map((item) => item.value),
      ...resolved.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      ...resolved.schedules.flatMap((section) => [...section.paragraphs, ...(section.bullets ?? [])]),
      resolved.closingNote,
    ].join('\n');
    const schedule1 = resolved.schedules.find((section) => section.heading === 'Schedule 1 - Additional Terms for Employment Permit Holders (Overseas Employees)')?.paragraphs.join('\n') || '';
    const schedule2 = resolved.schedules.find((section) => section.heading === 'Schedule 2 - Job Description');

    expect(field('Contracted hours')).toBe('35 hours per week');
    expect(field('Pay')).toBe(BIMED_ROLE_SALARIES.physiotherapist);
    expect(field('Pay')).toBe('€55,000 per annum');
    expect(field('Employment permit category')).toContain('Critical Skills Employment Permit (CSEP)');
    expect(allContractText).toContain('Intended employment permit pathway: Critical Skills Employment Permit (CSEP)');
    expect(allContractText).toContain('€55,000 per annum');
    expect(allContractText).not.toContain('EUR 45,514 to EUR 63,831');
    expect(schedule1).toContain('intended permit pathway is Critical Skills Employment Permit (CSEP)');
    expect(schedule1).not.toContain('General Employment Permit');
    expect(resolved.sections.find((section) => section.heading === '16. Right to Work')?.paragraphs.join('\n')).toContain('CORU');
    expect(schedule2?.paragraphs.join('\n')).toContain('Job title: Physiotherapist');
    expect(schedule2?.paragraphs.join('\n')).toContain(`Reports to: ${BIMED_DEFAULT_LINE_MANAGER}`);
    expect(schedule2?.bullets ?? []).toContain("Assessing service users' physical function, mobility and rehabilitation needs");
    expect(schedule2?.bullets ?? []).toContain('Ensuring all clinical practice remains within the CORU Standards of Proficiency for Physiotherapists');
  });
});
