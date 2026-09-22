import {
  normalizeRecruitmentRole,
  recruitmentRoleSlug,
  type CanonicalRecruitmentRole,
  type CanonicalRecruitmentRoleSlug,
} from '@/lib/bimed-role-policy';

export const ACCOMMODATION_OPTIONS_TERMS_VERSION = '2026-09-17-v2';
export const ACCOMMODATION_REFUND_INSTALLMENTS = 4;
export const EMPLOYMENT_PERMIT_FEE_EUR = 1000;
export const EMPLOYMENT_PERMIT_PLANNED_DURATION_MONTHS = 24;
export const IRISH_REGISTRATION_FEE_GUIDANCE_EUR = 300;

// GBP payment quote: latest XE mid-market EUR/GBP rate checked 18 September 2026 at 05:41 UTC.
// This is an indicative equivalent for candidates who prefer to pay in GBP. The contractual invoice remains denominated in EUR.
export const ACCOMMODATION_EUR_TO_GBP_RATE = 0.85881;
export const ACCOMMODATION_GBP_RATE_SOURCE = 'XE mid-market · 18 September 2026 · 07:19 UTC';

export function accommodationGbpEquivalent(amountEur: number): number {
  return Math.round(Number(amountEur || 0) * ACCOMMODATION_EUR_TO_GBP_RATE * 100) / 100;
}

export const ACCOMMODATION_PLANS = ['three_months_4000', 'three_months_shared_2000', 'one_month_1250', 'one_month_shared_625'] as const;
export type AccommodationPlan = (typeof ACCOMMODATION_PLANS)[number];

export const PERMIT_SUBMISSION_ROUTES = ['candidate_or_agency', 'bimed_legal_team'] as const;
export type PermitSubmissionRoute = (typeof PERMIT_SUBMISSION_ROUTES)[number];

export const PERMIT_TYPES = ['general_employment_permit', 'critical_skills_employment_permit'] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export const REFUND_TRIGGERS = ['successful_three_month_probation', 'one_month_accommodation_expiry'] as const;
export type AccommodationRefundTrigger = (typeof REFUND_TRIGGERS)[number];

export interface AccommodationPermitSelection {
  accommodation_plan: AccommodationPlan;
  accommodation_amount_eur: number;
  accommodation_period_months: number;
  accommodation_refund_installments: number;
  accommodation_refund_trigger: AccommodationRefundTrigger;
  /** Backward-compatible alias used by invoice/request messaging. */
  refund_trigger: AccommodationRefundTrigger;
  accommodation_plan_label: string;
  accommodation_summary: string;
  subsequent_accommodation: string;
  training_summary: string;
  permit_submission_route: PermitSubmissionRoute;
  permit_submission_label: string;
  permit_fee_eur: number;
  permit_fee_payer: 'candidate_or_agency' | 'bimed';
  permit_type: PermitType;
  permit_type_label: string;
  permit_duration_months: number;
  role: CanonicalRecruitmentRole | null;
  role_slug: CanonicalRecruitmentRoleSlug | null;
  immigration_registration_fee_guidance_eur: number;
  immigration_registration_fee_note: string;
  flights_and_airport_pickup_available: boolean;
  terms_version: string;
}

export function derivePermitType(roleValue: string | null | undefined): PermitType | null {
  const role = normalizeRecruitmentRole(roleValue);
  if (!role) return null;
  return role === 'Physiotherapist' ? 'critical_skills_employment_permit' : 'general_employment_permit';
}

export function permitTypeLabel(permitType: PermitType): string {
  return permitType === 'critical_skills_employment_permit'
    ? 'Critical Skills Employment Permit (CSEP)'
    : 'General Employment Permit (GEP)';
}

export function permitSubmissionLabel(route: PermitSubmissionRoute): string {
  return route === 'bimed_legal_team'
    ? 'BIMED legal team submits and pays'
    : 'Candidate or recruitment agency submits and pays';
}

export function accommodationPlanLabel(plan: AccommodationPlan): string {
  if (plan === 'three_months_shared_2000') {
    return `€2,000 EUR · ≈ £${accommodationGbpEquivalent(2000).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP · 3-month shared accommodation`;
  }
  if (plan === 'three_months_4000') {
    return `€4,000 EUR · ≈ £${accommodationGbpEquivalent(4000).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP · 3-month accommodation`;
  }
  if (plan === 'one_month_shared_625') {
    return `€625 EUR · ≈ £${accommodationGbpEquivalent(625).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP · 1-month shared accommodation`;
  }
  return `€1,250 EUR · ≈ £${accommodationGbpEquivalent(1250).toLocaleString('en-GB', { minimumFractionDigits: 2 })} GBP · 1-month accommodation`;
}

export function getAccommodationSelection(
  plan: AccommodationPlan,
  route: PermitSubmissionRoute,
  roleValue?: string | null,
): AccommodationPermitSelection {
  const role = normalizeRecruitmentRole(roleValue);
  const roleSlug = recruitmentRoleSlug(roleValue);
  const permitType = derivePermitType(roleValue);
  if (!permitType) throw new Error('UNSUPPORTED_RECRUITMENT_ROLE');

  const isShortStay = plan === 'one_month_1250' || plan === 'one_month_shared_625';
  const isSharedShortStay = plan === 'one_month_shared_625';
  const employerRoute = route === 'bimed_legal_team';
  const refundTrigger: AccommodationRefundTrigger = isShortStay && !employerRoute
    ? 'one_month_accommodation_expiry'
    : 'successful_three_month_probation';

  return {
    accommodation_plan: plan,
    accommodation_amount_eur: plan === 'three_months_shared_2000' ? 2000 : isSharedShortStay ? 625 : isShortStay ? 1250 : 4000,
    accommodation_period_months: isShortStay ? 1 : 3,
    accommodation_refund_installments: ACCOMMODATION_REFUND_INSTALLMENTS,
    accommodation_refund_trigger: refundTrigger,
    refund_trigger: refundTrigger,
    accommodation_plan_label: accommodationPlanLabel(plan),
    accommodation_summary: isShared
      ? plan === 'three_months_shared_2000'
        ? 'BIMED-arranged shared accommodation for the initial three-month probationary period. Your invoice is half of the €4,000 total arrangement.'
        : 'BIMED-arranged shared accommodation for the first month. Your invoice is half of the €1,250 total arrangement.'
      : isShortStay
        ? 'BIMED-arranged accommodation for the first month while you complete training, onboarding and shadow shifts with BIMED.'
        : 'BIMED-arranged accommodation for the initial three-month probationary period.',
    subsequent_accommodation: isShortStay
      ? 'After the first month, you arrange and pay for your own accommodation in Ireland.'
      : 'The BIMED-arranged accommodation covers the initial three-month probationary period. Continued accommodation is handled under the agreed relocation and employment arrangements.',
    training_summary: isShortStay
      ? isSharedShortStay
        ? 'The first month includes shared accommodation, training, onboarding and shadow shifting with BIMED.'
        : 'The first month includes training, onboarding and shadow shifting with BIMED.'
      : isShared
        ? 'The three-month shared arrangement covers the probationary period, including initial onboarding and work transition.'
        : 'The three-month arrangement covers the probationary period, including your initial onboarding and work transition.',
    permit_submission_route: route,
    permit_submission_label: permitSubmissionLabel(route),
    permit_fee_eur: EMPLOYMENT_PERMIT_FEE_EUR,
    permit_fee_payer: employerRoute ? 'bimed' : 'candidate_or_agency',
    permit_type: permitType,
    permit_type_label: permitTypeLabel(permitType),
    permit_duration_months: EMPLOYMENT_PERMIT_PLANNED_DURATION_MONTHS,
    role,
    role_slug: roleSlug,
    immigration_registration_fee_guidance_eur: IRISH_REGISTRATION_FEE_GUIDANCE_EUR,
    immigration_registration_fee_note: 'Irish immigration registration is normally €300 when a fee applies. Exemptions and current ISD requirements can apply. Registration is handled after arrival; the employment permit is a separate pre-travel process.',
    flights_and_airport_pickup_available: true,
    terms_version: ACCOMMODATION_OPTIONS_TERMS_VERSION,
  };
}

export function validateAccommodationSelection(input: {
  plan: unknown;
  route: unknown;
  roleValue?: string | null;
}) {
  if (!ACCOMMODATION_PLANS.includes(input.plan as AccommodationPlan)) throw new Error('INVALID_ACCOMMODATION_PLAN');
  if (!PERMIT_SUBMISSION_ROUTES.includes(input.route as PermitSubmissionRoute)) throw new Error('INVALID_PERMIT_SUBMISSION_ROUTE');
  return getAccommodationSelection(input.plan as AccommodationPlan, input.route as PermitSubmissionRoute, input.roleValue);
}

export function legacyAccommodationSelection(roleValue: string | null | undefined, permitTypeValue?: string | null) {
  const role = normalizeRecruitmentRole(roleValue);
  const roleSlug = recruitmentRoleSlug(roleValue);
  const permitType = derivePermitType(roleValue) || (permitTypeValue === 'critical_skills_employment_permit' ? permitTypeValue : 'general_employment_permit');
  const refundTrigger = 'successful_three_month_probation' as const;
  return {
    accommodation_plan: 'three_months_4000' as const,
    accommodation_amount_eur: 4000,
    accommodation_period_months: 3,
    accommodation_refund_installments: ACCOMMODATION_REFUND_INSTALLMENTS,
    accommodation_refund_trigger: refundTrigger,
    refund_trigger: refundTrigger,
    accommodation_plan_label: accommodationPlanLabel('three_months_4000'),
    accommodation_summary: 'Legacy BIMED-arranged accommodation for the initial three-month probationary period.',
    subsequent_accommodation: 'Legacy record. Continue under the original accommodation terms and any later agreed relocation arrangement.',
    training_summary: 'Legacy record. Initial onboarding and work transition are covered under the original arrangement.',
    permit_submission_route: null,
    permit_submission_label: 'Permit submission route not recorded on the legacy acknowledgement',
    permit_fee_eur: EMPLOYMENT_PERMIT_FEE_EUR,
    permit_fee_payer: null,
    permit_type: permitType as PermitType,
    permit_type_label: permitTypeLabel(permitType as PermitType),
    permit_duration_months: EMPLOYMENT_PERMIT_PLANNED_DURATION_MONTHS,
    role,
    role_slug: roleSlug,
    immigration_registration_fee_guidance_eur: IRISH_REGISTRATION_FEE_GUIDANCE_EUR,
    immigration_registration_fee_note: 'Irish immigration registration is normally €300 when a fee applies. Exemptions and current ISD requirements can apply.',
    flights_and_airport_pickup_available: true,
    terms_version: '2026-09-14-v1',
  };
}
