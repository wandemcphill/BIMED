import { describe, expect, it } from 'vitest';
import { applyContractOverrides, getContractTemplate } from '@/lib/contract-templates';

function allContractText(template: ReturnType<typeof getContractTemplate>) {
  if (!template) return '';
  return [
    ...template.sections.flatMap((section) => [...section.paragraphs, ...(section.bullets || [])]),
    ...template.schedules.flatMap((section) => [...section.paragraphs, ...(section.bullets || [])]),
    ...template.editableFields.map((field) => field.value),
  ].join('\n');
}

describe('employment contract address rendering', () => {
  it('uses the verified Irish address and the Primary Assignment label', () => {
    const template = getContractTemplate('healthcare-assistant');
    expect(template).not.toBeNull();

    const rendered = applyContractOverrides(template!, {
      employeeName: 'Jane Doe',
      employeeAddress: '12 Example Street, Dublin, Ireland',
      employeeAddressStatus: 'Private Accommodation: verified Irish residential address included.',
      startDate: '2027-01-11',
    });
    const text = allContractText(rendered);

    expect(rendered.employerSignatory.name).toBe('Dezou Maurice');
    expect(rendered.editableFields.some((field) => field.label === 'Place of Primary Assignment')).toBe(true);
    expect(text).toContain('of 12 Example Street, Dublin, Ireland');
    expect(text).toContain('12 Example Street, Dublin, Ireland');
    expect(text).not.toContain('[Employee address clause]');
  });

  it('removes the Irish address from the contract when accommodation is not verified', () => {
    const template = getContractTemplate('support-worker');
    expect(template).not.toBeNull();

    const rendered = applyContractOverrides(template!, {
      employeeName: 'Jane Doe',
      employeeAddress: null,
      employeeAddressStatus: 'Accommodation Not Verified: no Irish residential address included.',
      startDate: '2027-01-11',
    });
    const text = allContractText(rendered);

    expect(text).toContain('no Irish residential address included');
    expect(text).not.toContain('[Employee address clause]');
    expect(text).not.toContain('[Insert Irish residential address if verified]');
    expect(text).not.toContain('of [');
  });
});
