import { db } from '@/lib/db';
import { getContractTemplate, type ContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { applyBimedContractDefaults, BIMED_DEFAULT_CONTRACT_DURATION, BIMED_DEFAULT_END_DATE_ISO, BIMED_DEFAULT_LINE_MANAGER, BIMED_DEFAULT_START_DATE_ISO, BIMED_DEFAULT_START_DATE, recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { normalizeRecruitmentRole, BIMED_ROLE_SALARIES, BIMED_DEFAULT_PAY_FREQUENCY } from '@/lib/bimed-role-policy';

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
  | { status: 'template'; template: ContractTemplate; context: BimedStaffContractContext }
  | { status: 'not_found'; reason: string };

function formatDate(value: string | null | undefined): string {
  if (!value) return 'To be confirmed';
  const date = new Date(value.includes('T') ? value : value + 'T12:00:00Z');
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function joinAddress(staff: Record<string, any>): string {
  return [
    staff.address_line_1,
    staff.address_line_2,
    staff.city,
    staff.county,
    staff.eircode,
    staff.country && staff.country !== 'Ireland' ? staff.country : null,
  ].filter(Boolean).join(', ');
}

function fixedTermText(start: string, end: string): string {
  if (!start || !end) return 'Fixed-term employment; contractual dates are recorded in the BIMED Staff Portal.';
  return `Fixed-term employment from ${formatDate(start)} to ${formatDate(end)}`;
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

function replaceFields(template: ContractTemplate, fields: Record<string, { value: string; note?: string }>): ContractTemplate['editableFields'] {
  const updated = template.editableFields.map((field) => fields[field.label] ? { ...field, ...fields[field.label] } : field);
  for (const [label, value] of Object.entries(fields)) {
    if (!updated.some((field) => field.label === label)) updated.push({ label, ...value });
  }
  return updated;
}

export async function resolveStaffContractTemplate(staffId: string): Promise<ResolveResult> {
  const client = db();

  const { data: staff, error: staffError } = await client
    .from('recruitment_staff')
    .select('id,application_id,bimed_id,full_name,email,job_title,role,employment_start_date,employment_end_date,employment_type,department,manager_name,primary_location,address_line_1,address_line_2,city,county,eircode,country,updated_at')
    .eq('id', staffId)
    .maybeSingle();

  if (staffError || !staff) return { status: 'not_found', reason: 'Staff record not found.' };

  const roleValue = staff.job_title || staff.role || '';
  const roleSlug = recruitmentRoleSlug(roleValue);
  const roleLabel = normalizeRecruitmentRole(roleValue);
  if (!roleSlug || !roleLabel) return { status: 'not_found', reason: 'This staff record does not have a supported BIMED employment role.' };

  const [applicationResult, permitResult, signatureResult] = await Promise.all([
    staff.application_id
      ? client.from('recruitment_applications')
          .select('contract_accommodation_option,verified_irish_residential_address,contract_accommodation_verified_at,contract_accommodation_verified_by,living_in_ireland,country_of_residence')
          .eq('id', staff.application_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from('recruitment_staff_permit_cases')
      .select('id,permit_type,permit_submission_route,accommodation_offered,accommodation_plan,accommodation_period_months,flight_request_status,flight_departure_airport_code,flight_departure_airport_name,flight_destination_airport_code,flight_destination_airport_name,flight_passenger_count,flight_travel_date,flight_airport_pickup_required')
      .eq('staff_id', staffId)
      .maybeSingle(),
    staff.application_id
      ? client.from('recruitment_contract_signatures')
          .select('role_slug,issued_at,signed_at,status')
          .eq('application_id', staff.application_id)
          .eq('doc_type', 'contract')
          .in('status', ['signed', 'issued'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (applicationResult.error || permitResult.error || signatureResult.error) {
    return { status: 'not_found', reason: 'The staff contract record could not be loaded completely.' };
  }

  const application = applicationResult.data;
  const permit = permitResult.data;

  let itinerary: any = null;
  let transfer: any = null;

  if (permit?.id) {
    const [itineraryResult, transferResult] = await Promise.all([
      client.from('recruitment_flight_itineraries')
        .select('departure_airport_code,departure_airport_name,destination_airport_code,destination_airport_name,travel_date,passenger_count,airport_pickup_included,booking_status')
        .eq('permit_case_id', permit.id)
        .maybeSingle(),
      client.from('recruitment_arrival_transfers')
        .select('destination_name,destination_address,passenger_count,pickup_airport_code')
        .eq('permit_case_id', permit.id)
        .maybeSingle(),
    ]);
    if (!itineraryResult.error) itinerary = itineraryResult.data;
    if (!transferResult.error) transfer = transferResult.data;
  }

  const startDate = staff.employment_start_date || BIMED_DEFAULT_START_DATE_ISO;
  const endDate = staff.employment_end_date || BIMED_DEFAULT_END_DATE_ISO;
  const manager = (staff.manager_name || '').trim() || BIMED_DEFAULT_LINE_MANAGER;
  const primaryAssignment = (staff.primary_location || '').trim() || 'To be confirmed before employment-permit submission';
  const internationalHire = application?.living_in_ireland === 'No' || staff.country !== 'Ireland';

  const privateAccommodation = application?.contract_accommodation_option === 'private_accommodation';
  const bimedAccommodation = !privateAccommodation && Boolean(permit?.accommodation_offered && permit?.accommodation_plan);

  let accommodationRoute = 'Accommodation arrangement not recorded';
  let accommodationDetails = 'To be confirmed before issue.';
  let accommodationAddress = '';

  if (privateAccommodation) {
    accommodationRoute = 'Private accommodation arranged by employee';
    accommodationDetails = 'BIMED does not provide accommodation under the selected private-accommodation route.';
    accommodationAddress = application?.verified_irish_residential_address || '';
    if (!accommodationAddress) {
      accommodationDetails = 'Private accommodation selected. A verified Irish residential address is required before this contract is used for permit documentation.';
    }
  } else if (bimedAccommodation) {
    accommodationRoute = 'BIMED-offered accommodation';
    accommodationDetails = `${accommodationPlanText(permit?.accommodation_plan)} · ${permit?.accommodation_period_months || 'initial'} month arrangement recorded in the Staff Portal.`;
    accommodationAddress = transfer?.destination_address || '';
  }

  const departureAirportCode = itinerary?.departure_airport_code || permit?.flight_departure_airport_code || '';
  const departureAirportName = itinerary?.departure_airport_name || permit?.flight_departure_airport_name || '';
  const arrivalAirportCode = itinerary?.destination_airport_code || permit?.flight_destination_airport_code || '';
  const arrivalAirportName = itinerary?.destination_airport_name || permit?.flight_destination_airport_name || '';
  const passengerCount = itinerary?.passenger_count || permit?.flight_passenger_count || null;
  const travelDate = itinerary?.travel_date || permit?.flight_travel_date || null;
  const airportPickup = (itinerary?.airport_pickup_included ?? permit?.flight_airport_pickup_required) !== false;
  const departureAirport = departureAirportCode
    ? `${departureAirportCode} · ${departureAirportName || 'Departure airport'}`
    : departureAirportName || 'To be confirmed';
  const arrivalAirport = arrivalAirportCode
    ? `${arrivalAirportCode} · ${arrivalAirportName || 'Arrival airport in Ireland'}`
    : arrivalAirportName || 'To be confirmed';
  const travellingParty = passengerCount
    ? `${passengerCount} passenger${Number(passengerCount) === 1 ? '' : 's'}`
    : 'Not yet recorded · BIMED may sponsor up to 3 passengers on the initial travel request';

  const rawTemplate = getContractTemplate(roleSlug);
  if (!rawTemplate) return { status: 'not_found', reason: 'Contract template not found.' };

  let baseTemplate = rawTemplate;
  try {
    const override = await getDocumentOverride('contract', roleSlug);
    baseTemplate = mergeContractTemplate(rawTemplate, override);
  } catch {
    // Source-controlled template remains authoritative when the optional admin override is unavailable.
  }

  const template = applyBimedContractDefaults(
    applyBimedContractDefaults(baseTemplate, {
      employeeName: staff.full_name,
      employeeAddress: application?.verified_irish_residential_address || (staff.country === 'Ireland' ? joinAddress(staff) : null),
      startDate,
    })
  );

  const contractDuration = fixedTermText(startDate, endDate);
  const employeeAddress = application?.verified_irish_residential_address || (staff.country === 'Ireland' ? joinAddress(staff) : '');
  const employeeAddressStatus = employeeAddress
    ? privateAccommodation
      ? 'Verified Irish residential address linked to private accommodation selection.'
      : 'Irish residential address recorded on the BIMED staff record.'
    : internationalHire
      ? 'For overseas hires, the current overseas address remains in BIMED personnel records; the contract identifies the Irish accommodation arrangement separately.'
      : 'No employee residential address is currently recorded on this staff profile.';

  const baseStart = BIMED_DEFAULT_START_DATE;
  const baseEnd = '10 January 2029';
  const baseDuration = BIMED_DEFAULT_CONTRACT_DURATION;
  const replacements: Array<[string, string]> = [
    [baseStart, formatDate(startDate)],
    [baseEnd, formatDate(endDate)],
    [baseDuration, contractDuration],
    [`Fixed-term employment for two years, from ${baseStart} to ${baseEnd}`, contractDuration],
    [BIMED_DEFAULT_LINE_MANAGER, manager],
  ];

  const hours = template.editableFields.find((field) => field.label === 'Contracted hours')?.value || '';
  const salary = BIMED_ROLE_SALARIES[roleSlug as keyof typeof BIMED_ROLE_SALARIES] || template.editableFields.find((field) => field.label === 'Pay')?.value || 'To be confirmed';
  const roleGroup = template.editableFields.find((field) => field.label === 'Role group')?.value || roleLabel;

  const dynamicFieldValues: Record<string, { value: string; note?: string }> = {
    'Employee name': { value: staff.full_name, note: 'Populated from the canonical BIMED Staff Portal record.' },
    'Employee address': { value: employeeAddress || (internationalHire ? 'Overseas address retained in BIMED personnel records' : 'To be confirmed'), note: employeeAddressStatus },
    'Job title': { value: roleLabel, note: 'Populated from the canonical staff role.' },
    'Line manager': { value: manager, note: 'Populated from the BIMED Staff Portal. Defaults to the BIMED authorised reporting line where no staff-specific manager is recorded.' },
    'Start date': { value: formatDate(startDate), note: 'Populated from Staff Portal employment_start_date.' },
    'Contract end date': { value: formatDate(endDate), note: 'Populated from Staff Portal employment_end_date.' },
    'Contract duration': { value: contractDuration, note: 'Calculated from the canonical Staff Portal employment dates.' },
    'Place of Primary Assignment': { value: primaryAssignment, note: 'Populated from staff.primary_location. This should be a specific Irish place/location for permit documentation.' },
    'Accommodation / Permit Route': { value: `${accommodationRoute} · ${permitTypeLabel(permit?.permit_type, roleLabel)}`, note: 'Accommodation and permit pathway are read from the linked recruitment/permit record.' },
    'Contract address status': { value: employeeAddressStatus, note: 'Irish residential address is included only where a suitable Irish address is recorded or verified.' },
    'Contracted hours': { value: hours },
    'Pay': { value: salary },
    'Pay frequency': { value: BIMED_DEFAULT_PAY_FREQUENCY },
    'Role group': { value: roleGroup },
    'BIMED ID': { value: staff.bimed_id, note: 'Permanent BIMED workforce identifier.' },
    'Department': { value: staff.department || roleGroup },
    'Employment type': { value: staff.employment_type || 'Fixed-term' },
    'Employment permit category': { value: permitTypeLabel(permit?.permit_type, roleLabel), note: 'Intended permit pathway only; DETE decides eligibility and grant.' },
    'Permit submission route': { value: permit?.permit_submission_route === 'bimed_legal_team' ? 'BIMED Legal Team' : permit?.permit_submission_route === 'candidate_or_agency' ? 'Candidate / Recruitment Agency' : 'To be confirmed' },
    'Accommodation arrangement': { value: accommodationRoute },
    'Irish accommodation details': { value: accommodationDetails },
    'Irish accommodation address': { value: accommodationAddress || 'Address to be recorded when the selected accommodation is verified' },
    'Departure airport': { value: departureAirport },
    'Final airport in Ireland': { value: arrivalAirport },
    'Travel date': { value: travelDate ? formatDate(travelDate) : 'To be confirmed' },
    'Travelling party': { value: travellingParty },
    'Airport pickup': { value: airportPickup ? 'Included' : 'Not included' },
  };

  const relocationSchedule = {
    heading: 'Schedule 4 - Relocation, Accommodation and Initial Travel Support',
    paragraphs: [
      `4.1 Place of Primary Assignment: ${primaryAssignment}. The employee may be rostered at the assigned client home, care facility or other approved work location within the stated primary assignment, subject to BIMED operational requirements and the terms of this contract.`,
      `4.2 Accommodation route: ${accommodationRoute}. ${accommodationDetails}`,
      `4.3 Irish accommodation address: ${accommodationAddress || 'Not yet recorded in the contract because the relevant accommodation address has not been verified.'}`,
      `4.4 Initial international travel: BIMED will arrange the employee's initial economy air travel to Ireland and the related airport pickup, subject to immigration clearance, lawful entry and BIMED travel arrangements. BIMED may sponsor up to 3 passengers on the initial travel request where the travel record supports that arrangement.`,
      `4.5 Travel particulars recorded at the time of issue: Departure airport: ${departureAirport}. Final airport in Ireland: ${arrivalAirport}. Travel date: ${travelDate ? formatDate(travelDate) : 'To be confirmed'}. Travelling party: ${travellingParty}. Airport pickup: ${airportPickup ? 'Included' : 'Not included'}.`,
      '4.6 The flight and airport-pickup particulars are operational relocation arrangements and may be updated by BIMED before travel. Any change does not alter the employee\'s contractual place of primary assignment unless the employment contract is varied in writing.',
    ],
    bullets: [
      'BIMED arranges the ticketing process. The employee does not book or pay for the BIMED-arranged initial flight.',
      'The actual routing, airline, flight number, baggage allowance and departure time are determined at booking time and may differ from the indicative details recorded in this contract.',
      'Airport pickup is arranged to the applicable accommodation or other confirmed arrival destination recorded by BIMED.',
    ],
  };

  const allSections = template.sections.map((section) => replaceSection(section, replacements));
  const allSchedules = template.schedules.map((schedule) => replaceSection(schedule, replacements));
  const existingSchedule4 = allSchedules.find((schedule) => schedule.heading.startsWith('Schedule 4'));
  if (!existingSchedule4) allSchedules.push(relocationSchedule);

  const dynamicTemplate: ContractTemplate = {
    ...template,
    documentTitle: 'Employment Contract of Employment',
    effectiveDate: signatureResult.data?.issued_at ? `Issued ${formatDate(signatureResult.data.issued_at)}` : `Issued ${formatDate(staff.updated_at)}`,
    intro: `Republic of Ireland · ${roleLabel} · Final Employment Contract`,
    editableFields: replaceFields({ ...template, editableFields: template.editableFields }, dynamicFieldValues),
    sections: allSections,
    schedules: allSchedules,
    closingNote: replaceText(template.closingNote, replacements),
  };

  return {
    status: 'template',
    template: dynamicTemplate,
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
      permitType: permitTypeLabel(permit?.permit_type, roleLabel),
      permitSubmissionRoute: permit?.permit_submission_route || 'To be confirmed',
      accommodationRoute,
      accommodationDetails,
      accommodationAddress,
      departureAirport,
      arrivalAirport,
      travelDate: travelDate || '',
      travellingParty,
      airportPickup: airportPickup ? 'Included' : 'Not included',
      internationalHire,
      signedAt: signatureResult.data?.signed_at || null,
      issuedAt: signatureResult.data?.issued_at || null,
    },
  };
}
