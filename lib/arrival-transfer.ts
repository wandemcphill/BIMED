import type { SupabaseClient } from '@supabase/supabase-js';
import { getResendFromEmail } from '@/lib/recruitment-config';
import { Resend } from 'resend';

export const ARRIVAL_TRANSFER_SUPPLIER = { name: 'Avatravel', email: 'info@avatravel.ie' } as const;

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function validEmail(value: string) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value) && !/[\r\n\t]/.test(value);
}

async function sendSupplierEmail(input: { staff: any; transfer: any; idempotencyKey?: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { status: 'not_configured' as const };
  if (!validEmail(input.transfer.supplier_email)) return { status: 'invalid_recipient' as const };

  const passengerNames = Array.isArray(input.transfer.passenger_names) ? input.transfer.passenger_names : [];
  const subject = `BIMED arrival transfer request · ${input.staff.full_name} · ${input.transfer.flight_number || 'flight TBC'}`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#243039"><h2>BIMED Healthcare · Dublin Airport Arrival Transfer</h2><p>Please arrange the following pre-booked airport transfer for a BIMED overseas new hire.</p><table cellpadding="7" cellspacing="0" style="border-collapse:collapse"><tr><td><strong>Passenger</strong></td><td>${escapeHtml(input.staff.full_name)}</td></tr><tr><td><strong>BIMED ID</strong></td><td>${escapeHtml(String(input.staff.bimed_id || ''))}</td></tr><tr><td><strong>Pickup</strong></td><td>Dublin Airport (${escapeHtml(String(input.transfer.pickup_airport_code))})${input.transfer.pickup_terminal ? ` · ${escapeHtml(input.transfer.pickup_terminal)}` : ''}</td></tr><tr><td><strong>Destination</strong></td><td>${escapeHtml(String(input.transfer.destination_name || 'BIMED accommodation'))}${input.transfer.destination_address ? `<br>${escapeHtml(String(input.transfer.destination_address))}` : ''}</td></tr><tr><td><strong>Flight</strong></td><td>${escapeHtml(String(input.transfer.flight_number || ''))}${input.transfer.flight_booking_reference ? ` · booking ${escapeHtml(String(input.transfer.flight_booking_reference))}` : ''}</td></tr><tr><td><strong>Arrival</strong></td><td>${escapeHtml(String(input.transfer.flight_arrival_at || ''))}</td></tr><tr><td><strong>Passenger count</strong></td><td>${escapeHtml(String(input.transfer.passenger_count))}</td></tr><tr><td><strong>Passenger names</strong></td><td>${escapeHtml(passengerNames.join(', '))}</td></tr><tr><td><strong>Special instructions</strong></td><td>${escapeHtml(String(input.transfer.special_instructions || 'Meet and greet in arrivals with passenger name sign. Please monitor the flight for operational changes.'))}</td></tr></table><p><strong>Required supplier response:</strong> confirm the booking, provide your supplier reference, driver name/phone, vehicle description and meet point.</p><p>BIMED requires a pre-booked airport collection to the stated accommodation. Please use your live flight monitoring/dispatch process for arrival changes.</p></body></html>`;
  const text = [
    'BIMED HEALTHCARE · DUBLIN AIRPORT ARRIVAL TRANSFER', '',
    `Passenger: ${input.staff.full_name}`,
    `BIMED ID: ${input.staff.bimed_id || ''}`,
    `Pickup: ${input.transfer.pickup_airport_code}`,
    `Destination: ${input.transfer.destination_name || 'BIMED accommodation'}`,
    `Address: ${input.transfer.destination_address || ''}`,
    `Flight: ${input.transfer.flight_number || ''}`,
    `Booking reference: ${input.transfer.flight_booking_reference || ''}`,
    `Arrival: ${input.transfer.flight_arrival_at || ''}`,
    `Passengers: ${input.transfer.passenger_count}`,
    `Names: ${passengerNames.join(', ')}`,
    `Special instructions: ${input.transfer.special_instructions || 'Meet and greet in arrivals with passenger name sign. Monitor live flight status.'}`,
    '', 'Please confirm booking and return supplier reference, driver, vehicle and meet point details.',
  ].join('\n');

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: getResendFromEmail(), to: input.transfer.supplier_email, subject, html, text, replyTo: 'overseas@bimedhealthcare.com' }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined);
  if (error) return { status: 'failed' as const, reason: error.message };
  return { status: 'sent' as const, messageId: data?.id || null };
}

export async function dispatchArrivalTransfer(input: { client: SupabaseClient; staff: any; permit: any; itinerary: any; transfer: any; actor: string }) {
  const { data: prepared, error: prepareError } = await input.client.rpc('bimed_prepare_arrival_transfer_dispatch', {
    p_transfer_id: input.transfer.id,
    p_actor: input.actor,
  });
  if (prepareError || !prepared?.transfer) {
    throw new Error(prepareError?.message || 'Unable to prepare the airport pickup dispatch.');
  }

  const transfer = prepared.transfer;
  const idempotencyKey = prepared.idempotency_key;
  const transferForEmail = {
    ...transfer,
    supplier_name: ARRIVAL_TRANSFER_SUPPLIER.name,
    supplier_email: ARRIVAL_TRANSFER_SUPPLIER.email,
  };

  const result = await sendSupplierEmail({ staff: input.staff, transfer: transferForEmail, idempotencyKey });
  if (result.status !== 'sent') {
    const reason = result.status === 'not_configured'
      ? 'BIMED supplier dispatch email is not configured.'
      : result.status === 'invalid_recipient'
        ? 'BIMED supplier dispatch recipient is invalid.'
        : 'Supplier dispatch failed: ' + result.reason;

    try {
      await input.client.rpc('bimed_fail_arrival_transfer_dispatch', {
        p_transfer_id: input.transfer.id,
        p_actor: input.actor,
        p_error: reason,
      });
    } catch (failureError) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'arrival_transfer_dispatch_failure_recording_failed',
        transfer_id: input.transfer.id,
        reason: failureError instanceof Error ? failureError.message : String(failureError),
      }));
    }

    throw new Error(reason);
  }

  const { data: updated, error: completeError } = await input.client.rpc('bimed_complete_arrival_transfer_dispatch', {
    p_transfer_id: input.transfer.id,
    p_actor: input.actor,
    p_message_id: result.messageId || 'resend:unknown',
    p_sent_at: new Date().toISOString(),
  });

  if (completeError || !updated) {
    throw new Error(completeError?.message || 'Supplier dispatch was sent but the dispatch state could not be finalised. Retry the same dispatch to reconcile it safely.');
  }

  return updated;
}
