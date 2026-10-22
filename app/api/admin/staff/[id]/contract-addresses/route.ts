import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { db } from '@/lib/db';
import {
  formatBimedPopeQuayAddress,
  isBimedAccommodationUnit,
} from '@/lib/bimed-accommodation-address';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id: staffId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const primaryAssignment = typeof body.primaryAssignment === 'string' ? body.primaryAssignment.trim() : '';
  const accommodationUnit = body.accommodationUnit;
  const suppliedAddress = typeof body.accommodationAddress === 'string' ? body.accommodationAddress.trim() : '';
  const sharedWithBimedId = typeof body.sharedWithBimedId === 'string' ? body.sharedWithBimedId.trim() : '';
  const addressesConfirmed = body.addressesConfirmed === true;

  if (!primaryAssignment || primaryAssignment.length < 5 || primaryAssignment.length > 500) {
    return NextResponse.json({ error: 'Enter the full Place of Primary Assignment and Irish work address.' }, { status: 400 });
  }
  if (!isBimedAccommodationUnit(accommodationUnit)) {
    return NextResponse.json({ error: 'Select one of Flats 1–8 or choose Other Irish accommodation address.' }, { status: 400 });
  }
  const accommodationAddress = accommodationUnit === 'Other'
    ? suppliedAddress
    : formatBimedPopeQuayAddress(accommodationUnit);
  if (!accommodationAddress || accommodationAddress.length < 10 || accommodationAddress.length > 1000) {
    return NextResponse.json({ error: 'Enter a valid full Irish accommodation address.' }, { status: 400 });
  }
  if (sharedWithBimedId.length > 40) {
    return NextResponse.json({ error: 'The sharing candidate BIMED ID is too long.' }, { status: 400 });
  }
  if (!addressesConfirmed) {
    return NextResponse.json({ error: 'Confirm both addresses before saving.' }, { status: 409 });
  }

  const client = db();
  const { data: staff, error: staffError } = await client
    .from('recruitment_staff')
    .select('id,bimed_id,full_name,status,application_id')
    .eq('id', staffId)
    .maybeSingle();

  if (staffError || !staff) {
    return NextResponse.json({ error: 'Staff record not found.' }, { status: 404 });
  }
  if (staff.status !== 'pre_arrival' || !staff.application_id) {
    return NextResponse.json({ error: 'These contract-location fields are available for recruitment-linked pre-arrival hires.' }, { status: 409 });
  }

  if (sharedWithBimedId && staff.bimed_id?.toLowerCase() === sharedWithBimedId.toLowerCase()) {
    return NextResponse.json({ error: 'A candidate cannot be entered as their own accommodation-sharing partner.' }, { status: 400 });
  }

  const { data, error } = await client.rpc('bimed_update_staff_contract_locations', {
    p_staff_id: staffId,
    p_primary_assignment: primaryAssignment,
    p_accommodation_unit: accommodationUnit,
    p_accommodation_address: accommodationAddress,
    p_shared_with_bimed_id: sharedWithBimedId || null,
    p_actor: session.email,
    p_addresses_confirmed: true,
  });

  if (error || !data) {
    const detail = error?.message || '';
    if (detail.includes('STAFF_RECORD_NOT_FOUND') || detail.includes('PERMIT_CASE_NOT_FOUND')) {
      return NextResponse.json({ error: 'The staff or permit record could not be found.' }, { status: 404 });
    }
    if (
      detail.includes('ACCOMMODATION_UNIT_ALREADY_ASSIGNED') ||
      detail.includes('SIGNED_DETE_CONTRACT_EXISTS') ||
      detail.includes('CONTRACT_LOCATIONS_ONLY_FOR_PRE_ARRIVAL_RECRUITS') ||
      detail.includes('CONTRACT_LOCATIONS_CONFIRMATION_REQUIRED')
    ) {
      return NextResponse.json({
        error: detail.includes('ACCOMMODATION_UNIT_ALREADY_ASSIGNED')
          ? 'This flat is already assigned to another candidate. Confirm the sharing arrangement by entering the other candidate’s BIMED ID in both records, or choose a different flat.'
          : detail.includes('SIGNED_DETE_CONTRACT_EXISTS')
            ? 'A DETE contract has already been signed. The existing signed contract cannot be changed; an amended-contract process is required.'
            : 'The contract addresses could not be saved under the current candidate status.',
      }, { status: 409 });
    }
    if (
      detail.includes('_INVALID') ||
      detail.includes('ACCOMMODATION_ADDRESS_DOES_NOT_MATCH_SELECTED_FLAT') ||
      detail.includes('SHARED_ACCOMMODATION_PARTNER_NOT_FOUND')
    ) {
      return NextResponse.json({
        error: detail.includes('SHARED_ACCOMMODATION_PARTNER_NOT_FOUND')
          ? 'The sharing candidate BIMED ID was not found.'
          : 'Check the work address, selected accommodation unit and residential address.',
      }, { status: 400 });
    }
    console.error(JSON.stringify({
      level: 'error',
      event: 'contract_locations_save_failed',
      staff_id: staffId,
      reason: detail || 'unknown',
    }));
    return NextResponse.json({ error: 'Unable to save the contract addresses right now.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    staff: { id: staff.id, bimed_id: staff.bimed_id, full_name: staff.full_name },
    locations: data,
    message: 'Work and accommodation addresses saved and verified.',
  });
}
