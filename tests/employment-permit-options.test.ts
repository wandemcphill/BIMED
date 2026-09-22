import { describe, expect, it } from 'vitest';
import {
  derivePermitType,
  getAccommodationSelection,
  legacyAccommodationSelection,
  validateAccommodationSelection,
} from '@/lib/employment-permit-options';

describe('employment permit and accommodation selection policy', () => {
  it('maps physiotherapist to CSEP and care roles to GEP', () => {
    expect(derivePermitType('Physiotherapist')).toBe('critical_skills_employment_permit');
    expect(derivePermitType('Healthcare Assistant')).toBe('general_employment_permit');
    expect(derivePermitType('Senior Support Worker')).toBe('general_employment_permit');
    expect(derivePermitType('Support Worker')).toBe('general_employment_permit');
  });

  it('builds the €4,000 three-month selection with the normal probation refund trigger', () => {
    const selection = getAccommodationSelection('three_months_4000', 'candidate_or_agency', 'Healthcare Assistant');
    expect(selection.accommodation_amount_eur).toBe(4000);
    expect(selection.accommodation_period_months).toBe(3);
    expect(selection.accommodation_refund_trigger).toBe('successful_three_month_probation');
    expect(selection.permit_fee_eur).toBe(1000);
    expect(selection.permit_duration_months).toBe(24);
  });

  it('builds the €1,250 one-month selection with route-dependent refund triggers', () => {
    const employerRoute = getAccommodationSelection('one_month_1250', 'bimed_legal_team', 'Support Worker');
    const selfRoute = getAccommodationSelection('one_month_1250', 'candidate_or_agency', 'Support Worker');
    expect(employerRoute.accommodation_refund_trigger).toBe('successful_three_month_probation');
    expect(employerRoute.accommodation_amount_eur).toBe(1250);
    expect(selfRoute.accommodation_refund_trigger).toBe('one_month_accommodation_expiry');
    expect(selfRoute.accommodation_amount_eur).toBe(1250);
  });

  it('builds the €625 one-month shared selection with route-dependent refund triggers', () => {
    const employerRoute = getAccommodationSelection('one_month_shared_625', 'bimed_legal_team', 'Support Worker');
    const selfRoute = getAccommodationSelection('one_month_shared_625', 'candidate_or_agency', 'Support Worker');
    expect(employerRoute.accommodation_refund_trigger).toBe('successful_three_month_probation');
    expect(employerRoute.accommodation_amount_eur).toBe(625);
    expect(employerRoute.accommodation_period_months).toBe(1);
    expect(selfRoute.accommodation_refund_trigger).toBe('one_month_accommodation_expiry');
    expect(selfRoute.accommodation_amount_eur).toBe(625);
  });

  it('rejects invalid plan or route values', () => {
    expect(() => validateAccommodationSelection({ plan: '€999', route: 'bimed_legal_team', roleValue: 'Support Worker' })).toThrow('INVALID_ACCOMMODATION_PLAN');
    expect(() => validateAccommodationSelection({ plan: 'one_month_1250', route: 'someone_else', roleValue: 'Support Worker' })).toThrow('INVALID_PERMIT_SUBMISSION_ROUTE');
    expect(() => validateAccommodationSelection({ plan: 'one_month_1250', route: 'bimed_legal_team', roleValue: 'Chef' })).toThrow('UNSUPPORTED_RECRUITMENT_ROLE');
  });

  it('preserves legacy records as the €4,000 three-month plan without inventing a permit payer', () => {
    const legacy = legacyAccommodationSelection('Healthcare Assistant', 'general_employment_permit');
    expect(legacy.accommodation_plan).toBe('three_months_4000');
    expect(legacy.accommodation_amount_eur).toBe(4000);
    expect(legacy.accommodation_period_months).toBe(3);
    expect(legacy.permit_submission_route).toBeNull();
    expect(legacy.terms_version).toBe('2026-09-14-v1');
  });
});
