import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME, getAdminSessionFromToken } from '@/lib/admin-session';
import { getContractTemplate, type ContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { resolveContractAddress } from '@/lib/contract-accommodation';
import {
  applyBimedContractDefaults,
  BIMED_DEFAULT_CONTRACT_DURATION,
  BIMED_DEFAULT_END_DATE_ISO,
  BIMED_DEFAULT_LINE_MANAGER,
  BIMED_DEFAULT_START_DATE,
  BIMED_DEFAULT_START_DATE_ISO,
  BIMED_DEFAULT_PAY_FREQUENCY,
  BIMED_ROLE_SALARIES,
  recruitmentRoleSlug,
  normalizeRecruitmentRole,
} from '@/lib/bimed-role-policy';

export type BimedStaffContractContext = {
  staffId: string;
  applicationId: string | null;
  bimedId: string;
  employeeName: string;
  employeeEmail: string;
  employeeAddress: string;
  employeeAddressStatus: string;
  roleSlug: string;
  roleLabel: string;
  department: string;
  employmentType: string;
  startDate: string;
  endDate: string;
  contractDuration: string;
  lineManager: string;
  primaryAssignment: string;
  pay: string;
  payFrequency: string;
  contractedHours: string;
  permitType: string;
  permitSubmissionRoute: string;
  permitApplicationId: string;
  accommodationRoute: string;
  accommodationDetails: string;
  accommodationAddress: string;
  departureAirport: string;
  arrivalAirport: string;
  travelDate: string;
  travellingParty: string;
  airportPickup: string;
  internationalHire: boolean;
  signedAt: string | null;
  issuedAt: string | null;
};

type ResolveResult =
  | {
      status: 'template';
      template: ContractTemplate;
      context: BimedStaffContractContext;
      prefilledFor: { name: string; email: string };
    }
  | { status: 'unauthorized' }
  | { status: 'not_found'; reason: string }
  | { status: 'blocked'; reason: string };

function formatDate(value: string | null | undefined): string {
  if (!value) return 'To be confirmed';
  const date = new Date(value.includes('T') ? value : value + 'T12:00:00Z');
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function joinAddress(staff: Record<string, any>): string {
  return [staff.address_line_1, staff.address_line_2, staff.city, staff.county, staff.eircode, staff.country]
    .filter(Boolean)
    .join(', ');
}

function fixedTermText(start: string, end: string): string {
  if (!start || !end) return 'Fixed-term employment; contractual dates are recorded in the BIMED Staff Portal.';
  return 'Fixed-term employment from ' + formatDate(start) + ' to ' + formatDate(end);
}

function accommodationPlanText(plan: string | null | undefined): string {
  switch (plan) {
    case 'three_months_4000':
      return '€4,000 EUR · 3 months';
    case 'three_months_shared_2000':
      return '€2,000 EUR · 3 months shared arrangement';
    case 'one_month_1250':
      return '€1,250 EUR · 1 month';
    case 'one_month_shared_625':
      return '€625 EUR · 1 month shared arrangement';
    default:
      return 'BIMED accommodation plan not yet recorded';
  }
}

function permitTypeLabel(value: string | null | undefined, role: string): string {
  if (value === 'critical_skills_employment_permit') return 'Critical Skills Employment Permit (CSEP), subject to DETE eligibility and grant';
  if (value === 'general_employment_permit') return 'General Employment Permit (GEP), subject to DETE eligibility and grant';
  return role === 'Physiotherapist'
    ? 'Critical Skills Employment Permit (CSEP), subject to DETE eligibility and grant'
    : 'General Employment Permit (GEP), subject to DETE eligibility and grant';
}

function replaceText(value: string, replacements: Array<[string, string]>): string {
  return replacements.reduce((current, [from, to]) => current.split(from).join(to), value);
}

function replaceSection(section: ContractTemplate['sections'][number], replacements: Array<[string, string]>) {
  return {
    ...section,
    heading: replaceText(section.heading, replacements),
    paragraphs: section.paragraphs.map((paragraph) => replaceText(paragraph, replacements)),
    bullets: section.bullets?.map((bullet) => replaceText(bullet, replacements)),
  };
}

function replaceSchedule(section: ContractTemplate['schedules'][number], replacements: Array<[string, string]>) {
  return {
    ...section,
    heading: replaceText(section.heading, replacements),
    paragraphs: section.paragraphs.map((paragraph) => replaceText(paragraph, replacements)),
    bullets: section.bullets?.map((bullet) => replaceText(bullet, replacements)),
  };
}

function replaceFields(
  template: ContractTemplate,
  fields: Record<string, { value: string; note?: string }>
): ContractTemplate['editableFields'] {
  const updated = template.editableFields.map((field) =>
    fields[field.label] ? { ...field, ...fields[field.label] } : field
  );

  for (const [label, value] of Object.entries(fields)) {
    if (!updated.some((field) => field.label === label)) updated.push({ label, ...value });
  }

  return updated;
}

function accommodationReady(permit: any, invoice: any, application: any): { ready: boolean; private: boolean } {
  const privateSelected = application?.contract_accommodation_option === 'private_accommodation';
  if (privateSelected) {
    return { ready: Boolean(application?.verified_irish_residential_address), private: true };
  }

  const bimedSelected = Boolean(
    permit?.accommodation_offered &&
    permit?.accommodation_plan &&
    permit?.accommodation_terms_acknowledged_at &&
    (invoice?.status === 'issued' || invoice?.status === 'paid')
  );

  return { ready: bimedSelected, private: false };
}

export async function resolveStaffContractTemplate(staffId: string): Promise<ResolveResult> {
  const cookieStore = await cookies();
  const session = await getAdminSessionFromToken(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session) return { status: 'unauthorized' };

  const client = db();

  const { data: staff, error: staffError } = await client
    .from('recruitment_staff')
    .select('id,application_id,bimed_id,full_name,email,job_title,role,employment_start_date,employment_end_date,employment_type,department,manager_name,primary_location,address_line_1,address_line_2,city,county,eircode,country,updated_at')
    .eq('id', staffId)
    .maybeSingle();

  if (staffError || !staff) return { status: 'not_found', reason: 'Staff record not found.' };
  if (staff.status !== 'pre_arrival' || !staff.application_id) {
    return { status: 'blocked', reason: 'The DETE permit-stage contract is only available for an overseas recruitment-linked pre-arrival hire.' };
  }

  const roleValue = staff.job_title || staff.role || '';
  const roleSlug = recruitmentRoleSlug(roleValue);
  const roleLabel = normalizeRecruitmentRole(roleValue);
  if (!roleSlug || !roleLabel) {
    return { status: 'not_found', reason: 'This staff record does not have a supported BIMED employment role.' };
  }

  const [applicationResult, permitResult, signatureResult, externalContractResult] = await Promise.all([
    client.from('recruitment_applications')
      .select('contract_accommodation_option,verified_irish_residential_address,contract_accommodation_verified_at,contract_accommodation_verified_by,living_in_ireland,country_of_residence,address')
      .eq('id', staff.application_id)
      .maybeSingle(),
    client.from('recruitment_staff_permit_cases')
      .select('id,permit_type,permit_application_id,permit_submission_route,accommodation_offered,accommodation_plan,accommodation_period_months,accommodation_terms_acknowledged_at,flight_request_status,flight_departure_airport_code,flight_departure_airport_name,flight_destination_airport_code,flight_destination_airport_name,flight_passenger_count,flight_travel_date,flight_airport_pickup_required')
      .eq('staff_id', staffId)
      .maybeSingle(),
    client.from('recruitment_contract_signatures')
      .select('role_slug,issued_at,signed_at,status')
      .eq('application_id', staff.application_id)
      .eq('doc_type', 'contract')
      .in('status', ['signed', 'issued'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (applicationResult.error || permitResult.error || signatureResult.error || externalContractResult.error) {
    return { status: 'not_found', reason: 'The staff contract record could not be loaded completely.' };
  }

  const application = applicationResult.data;
  const permit = permitResult.data;

  if (!permit) return { status: 'blocked', reason: 'The overseas employment-permit case has not been initialized.' };
  if (!signatureResult.data && !externalContractResult.data) {
    return { status: 'blocked', reason: 'The initial BIMED onboarding contract must already be signed or administrator-verified before the separate permit-stage contract can be issued.' };
  }
  if (!permit.permit_submission_route) {
    return { status: 'blocked', reason: 'The employment-permit submission route has not yet been selected.' };
  }
  if (!String(staff.primary_location || '').trim()) {
    return { status: 'blocked', reason: 'Place of Primary Assignment has not yet been recorded for this hire.' };
  }

  const { data: invoice } = await client
    .from('recruitment_accommodation_invoices')
    .select('status,amount_eur,invoice_number')
    .eq('permit_case_id', permit.id)
    .maybeSingle();

  const accommodation = accommodationReady(permit, invoice, application);
  if (!accommodation.ready) {
    return {
      status: 'blocked',
      reason: 'Accommodation is not yet ready. The candidate must complete the applicable accommodation selection and BIMED must have the required confirmation before the DETE permit-stage contract can be issued.',
    };
  }

  const { data: itinerary } = await client
    .from('recruitment_flight_itineraries')
    .select('id,departure_airport_code,departure_airport_name,destination_airport_code,destination_airport_name,travel_date,passenger_count,passengers,airport_pickup_included,booking_status')
    .eq('permit_case_id', permit.id)
    .maybeSingle();

  if (!itinerary?.id || !itinerary.departure_airport_code || !itinerary.departure_airport_name || !itinerary.destination_airport_code || !itinerary.travel_date || !itinerary.passenger_count || !Array.isArray(itinerary.passengers) || itinerary.passengers.length !== Number(itinerary.passenger_count)) {
    return {
      status: 'blocked',
      reason: 'The candidate has not yet submitted the required travel itinerary. Submit the initial travel request before issuing the DETE permit-stage contract.',
    };
  }

  const startDate = staff.employment_start_date || BIMED_DEFAULT_START_DATE_ISO;
  const endDate = staff.employment_end_date || BIMED_DEFAULT_END_DATE_ISO;
  const manager = (staff.manager_name || '').trim() || BIMED_DEFAULT_LINE_MANAGER;
  const primaryAssignment = (staff.primary_location || '').trim() || 'To be confirmed before employment-permit submission';
  const internationalHire = application?.living_in_ireland === 'No' || staff.country !== 'Ireland';

  const currentEmployeeAddress = joinAddress(staff) || application?.address || 'Current residential address recorded in the BIMED recruitment record';
  const employeeAddress = currentEmployeeAddress;
  const employeeAddressStatus = 'Current residential address from the BIMED recruitment/staff record. This is separate from the Irish accommodation address used for the permit-stage relocation record.';
  if (accommodation.private) {
    const addressResolution = resolveContractAddress(application || {});
    if (!addressResolution.ready || addressResolution.mode !== 'private_verified') {
      return { status: 'blocked', reason: addressResolution.message };
    }
  }

  const accommodationRoute = accommodation.private
    ? 'Private accommodation selected by employee'
    : 'BIMED-offered accommodation';

  const accommodationDetails = accommodation.private
    ? 'BIMED does not provide the accommodation under the selected private-accommodation route.'
    : accommodationPlanText(permit.accommodation_plan) + ' · ' + String(permit.accommodation_period_months || 'initial') + ' month arrangement recorded by BIMED.';

  const accommodationAddress = accommodation.private
    ? String(application?.verified_irish_residential_address || '')
    : '';

  const departureAirportCode = itinerary.departure_airport_code || permit.flight_departure_airport_code || '';
  const departureAirportName = itinerary.departure_airport_name || permit.flight_departure_airport_name || '';
  const arrivalAirportCode = itinerary.destination_airport_code || permit.flight_destination_airport_code || 'DUB';
  const arrivalAirportName = itinerary.destination_airport_name || permit.flight_destination_airport_name || 'Dublin Airport';
  const passengerCount = itinerary.passenger_count || permit.flight_passenger_count;
  const travelDate = itinerary.travel_date || permit.flight_travel_date;
  const airportPickup = (itinerary.airport_pickup_included ?? permit.flight_airport_pickup_required) !== false;
  const departureAirport = departureAirportCode
    ? departureAirportCode + ' · ' + (departureAirportName || 'Departure airport')
    : 'To be confirmed';
  const arrivalAirport = arrivalAirportCode
    ? arrivalAirportCode + ' · ' + (arrivalAirportName || 'Arrival airport in Ireland')
    : 'To be confirmed';
  const travellingParty = passengerCount
    ? String(passengerCount) + ' passenger' + (Number(passengerCount) === 1 ? '' : 's')
    : 'To be confirmed';

  const rawTemplate = getContractTemplate(roleSlug);
  if (!rawTemplate) return { status: 'not_found', reason: 'Contract template not found.' };

  let baseTemplate = rawTemplate;
  try {
    const override = await getDocumentOverride('contract', roleSlug);
    baseTemplate = mergeContractTemplate(rawTemplate, override);
  } catch {
    // The source-controlled template remains authoritative when the optional override is unavailable.
  }

  const template = applyBimedContractDefaults(baseTemplate, {
    employeeName: staff.full_name,
    employeeAddress,
    startDate,
  });

  const contractDuration = fixedTermText(startDate, endDate);
  const salary = BIMED_ROLE_SALARIES[roleSlug as keyof typeof BIMED_ROLE_SALARIES]
    || template.editableFields.find((field) => field.label === 'Pay')?.value
    || 'To be confirmed';
  const hours = template.editableFields.find((field) => field.label === 'Contracted hours')?.value || 'To be confirmed';
  const roleGroup = template.editableFields.find((field) => field.label === 'Role group')?.value || roleLabel;
  const permitType = permitTypeLabel(permit.permit_type, roleLabel);
  const permitRoute = permit.permit_submission_route === 'bimed_legal_team'
    ? 'BIMED Legal Team'
    : permit.permit_submission_route === 'candidate_or_agency'
      ? 'Candidate / Recruitment Agency'
      : 'To be confirmed';

  const baseStart = BIMED_DEFAULT_START_DATE;
  const baseEnd = '10 January 2029';
  const baseDuration = BIMED_DEFAULT_CONTRACT_DURATION;

  const replacements: Array<[string, string]> = [
    [baseStart, formatDate(startDate)],
    [baseEnd, formatDate(endDate)],
    [baseDuration, contractDuration],
    ['Fixed-term employment for two years, from ' + baseStart + ' to ' + baseEnd, contractDuration],
    [BIMED_DEFAULT_LINE_MANAGER, manager],
  ];

  const dynamicFieldValues: Record<string, { value: string; note?: string }> = {
    'Employee name': { value: staff.full_name, note: 'Populated from the canonical BIMED Staff Portal record.' },
    'Employee address': { value: employeeAddress, note: employeeAddressStatus },
    'Job title': { value: roleLabel, note: 'Populated from the canonical staff role.' },
    'Line manager': { value: manager, note: 'Populated from the BIMED Staff Portal.' },
    'Start date': { value: formatDate(startDate), note: 'Populated from Staff Portal employment_start_date.' },
    'Contract end date': { value: formatDate(endDate), note: 'Populated from Staff Portal employment_end_date.' },
    'Contract duration': { value: contractDuration, note: 'Calculated from the canonical Staff Portal employment dates.' },
    'Place of Primary Assignment': { value: primaryAssignment, note: 'Populated from staff.primary_location. The permit application and permit must use the applicable location/s.' },
    'Accommodation / Permit Route': { value: accommodationRoute + ' · ' + permitType, note: 'Finalised from the linked BIMED overseas permit/accommodation record.' },
    'Contract address status': { value: employeeAddressStatus },
    'Contracted hours': { value: hours },
    'Pay': { value: salary },
    'Pay frequency': { value: BIMED_DEFAULT_PAY_FREQUENCY },
    'Role group': { value: roleGroup },
    'BIMED ID': { value: staff.bimed_id, note: 'Permanent BIMED workforce identifier.' },
    'Department': { value: staff.department || roleGroup },
    'Employment type': { value: staff.employment_type || 'Fixed-term' },
    'Employment permit category': { value: permitType, note: 'Intended permit pathway. DETE decides eligibility and grant.' },
    'Permit submission route': { value: permitRoute },
    'DETE Work ID / application reference': { value: permit.permit_application_id || 'To be populated when allocated' },
    'Accommodation arrangement': { value: accommodationRoute },
    'Irish accommodation details': { value: accommodationDetails },
    'Irish accommodation address': { value: accommodationAddress || 'BIMED accommodation address to be recorded in the relocation record; not inserted as the employee current address.' },
    'Departure airport': { value: departureAirport },
    'Final airport in Ireland': { value: arrivalAirport },
    'Travel date': { value: formatDate(travelDate) },
    'Travelling party': { value: String(passengerCount) + ' passenger' + (Number(passengerCount) === 1 ? '' : 's') },
    'Airport pickup': { value: airportPickup ? 'Included' : 'Not included' },
    'Employer contact': { value: 'BIMED Recruitment / Overseas Recruitment · recruitment@bimedhealthcare.com · overseas@bimedhealthcare.com' },
  };

  const relocationSchedule = {
    heading: 'Schedule 4 - Permit-Stage Relocation, Accommodation and Initial Travel Support',
    paragraphs: [
      '4.1 Place of Primary Assignment: ' + primaryAssignment + '. The employee may be rostered at the assigned client home, care facility or other approved work location within the stated primary assignment, subject to BIMED operational requirements and the terms of this contract.',
      '4.2 Accommodation route: ' + accommodationRoute + '. ' + accommodationDetails,
      '4.3 Irish accommodation address: ' + (accommodationAddress || 'Not stated in the employee address field. For BIMED-offered accommodation, the confirmed accommodation destination is maintained in the relocation record and may be updated before arrival.'),
      '4.4 Initial travel support: BIMED will arrange the employee\'s initial economy air travel to Ireland and the related airport pickup, subject to immigration clearance, lawful entry and BIMED travel arrangements. BIMED travel support may cover up to 3 travellers where recorded in the travel request.',
      '4.5 Travel particulars at permit-stage issue: Departure airport: ' + departureAirport + '. Final airport in Ireland: ' + arrivalAirport + '. Planned travel date: ' + formatDate(travelDate) + '. Travelling party: ' + passengerCount + ' passenger' + (Number(passengerCount) === 1 ? '' : 's') + '. Airport pickup: ' + (airportPickup ? 'Included' : 'Not included') + '.',
      '4.6 Travel particulars are operational relocation arrangements and may be updated by BIMED before travel. Any travel update does not by itself amend the contractual employment terms or place of primary assignment.',
    ],
    bullets: [
      'BIMED arranges and pays for the initial economy flight under the overseas new-hire travel process.',
      'The actual airline, flight number, routing, baggage allowance and departure time are confirmed at booking and may differ from the planning itinerary.',
      'BIMED arranges and pays for the airport pickup from the final Irish arrival airport to the confirmed accommodation or arrival destination.',
    ],
  };

  const allSections = template.sections.map((section) => replaceSection(section, replacements));
  const allSchedules = template.schedules.map((schedule) => replaceSchedule(schedule, replacements));
  if (!allSchedules.some((schedule) => schedule.heading.startsWith('Schedule 4'))) {
    allSchedules.push(relocationSchedule);
  }

  const dynamicTemplate: ContractTemplate = {
    ...template,
    documentTitle: 'Final Employment Contract for Employment Permit Application',
    effectiveDate: 'Prepared ' + formatDate(new Date().toISOString()),
    intro: 'Republic of Ireland · ' + roleLabel + ' · Permit-stage employment contract',
    editableFields: replaceFields(template, dynamicFieldValues),
    sections: allSections,
    schedules: allSchedules,
    closingNote: replaceText(template.closingNote, replacements),
  };

  return {
    status: 'template',
    template: dynamicTemplate,
    prefilledFor: { name: staff.full_name, email: staff.email },
    context: {
      staffId: staff.id,
      applicationId: staff.application_id || null,
      bimedId: staff.bimed_id,
      employeeName: staff.full_name,
      employeeEmail: staff.email,
      employeeAddress,
      employeeAddressStatus,
      roleSlug,
      roleLabel,
      department: staff.department || roleGroup,
      employmentType: staff.employment_type || 'Fixed-term',
      startDate,
      endDate,
      contractDuration,
      lineManager: manager,
      primaryAssignment,
      pay: salary,
      payFrequency: BIMED_DEFAULT_PAY_FREQUENCY,
      contractedHours: hours,
      permitType,
      permitSubmissionRoute: permitRoute,
      permitApplicationId: permit.permit_application_id || '',
      accommodationRoute,
      accommodationDetails,
      accommodationAddress,
      departureAirport,
      arrivalAirport,
      travelDate: travelDate || '',
      travellingParty: String(passengerCount) + ' passenger' + (Number(passengerCount) === 1 ? '' : 's'),
      airportPickup: airportPickup ? 'Included' : 'Not included',
      internationalHire,
      signedAt: signatureResult.data?.signed_at || null,
      issuedAt: signatureResult.data?.issued_at || null,
    },
  };
}
