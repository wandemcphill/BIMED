import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { appUrl, sendAccommodationEmail } from '@/lib/accommodation-billing';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
  const expected = process.env.BIMED_SPONSORSHIP_CRON_SECRET?.trim() || '';
  const received = request.headers.get('x-bimed-cron-secret')?.trim() || '';
  if (!expected || !received || received !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const client = db();
    const enforcementStartedAt = new Date().toISOString();
    const { data, error } = await client.rpc('bimed_enforce_due_sponsorship_cancellations');
    if (error) throw error;

    const { data: pendingNotifications, error: notificationLookupError } = await client
      .from('recruitment_staff_permit_cases')
      .select(`
        id,
        staff_id,
        cancellation_finalized_at,
        cancellation_finalization_email_sent_at,
        staff:recruitment_staff!recruitment_staff_permit_cases_staff_id_fkey(
          id,
          full_name,
          bimed_id,
          email,
          application_id
        )
      `)
      .not('cancellation_finalized_at', 'is', null)
      .is('cancellation_finalization_email_sent_at', null)
      .gte('cancellation_finalized_at', enforcementStartedAt)
      .order('cancellation_finalized_at', { ascending: true })
      .limit(100);

    if (notificationLookupError) throw notificationLookupError;

    let emailsSent = 0;
    let emailFailures = 0;

    for (const record of pendingNotifications || []) {
      const staff = Array.isArray(record.staff) ? record.staff[0] : record.staff;
      if (!staff?.email || !staff.application_id) continue;

      const candidateName = staff.full_name || 'Candidate';
      const finalizedAt = record.cancellation_finalized_at;
      const subject = `BIMED sponsorship cancellation finalised: ${staff.bimed_id || candidateName}`;
      const htmlParts = [
        '<div style="font-family:Arial,sans-serif;color:#172b4d;line-height:1.6">',
        '<h2>Sponsorship cancellation finalised</h2>',
        `<p>Hello ${escapeHtml(candidateName)},</p>`,
        '<p>Your 24-hour cancellation reversal window has expired without the cancellation being revoked.</p>',
        '<p>BIMED has therefore finalised the cancellation workflow. Your recruitment application has been withdrawn, any issued employment contract has been voided, and the related employment-permit / sponsorship journey has been closed. Your BIMED Staff Portal access has also been restricted.</p>',
        `<p><strong>Finalised:</strong> ${escapeHtml(finalizedAt || new Date().toISOString())}</p>`,
        '<p>If you believe this action was applied in error or you need clarification about the record, please contact BIMED at <a href="mailto:info@bimedhealthcare.com">info@bimedhealthcare.com</a>.</p>',
        `<p><a href="${appUrl()}/staff/permit" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;font-weight:800">Open Staff Portal</a></p>`,
        '<p style="color:#627d98;font-size:12px">This email confirms completion of the sponsorship-cancellation workflow. It does not alter any separate immigration or regulatory decision made by the relevant authority.</p>',
        '</div>',
      ];
      const html = htmlParts.join('');

      try {
        await sendAccommodationEmail({
          to: staff.email,
          subject,
          html,
        });

        const now = new Date().toISOString();
        const { error: markError } = await client
          .from('recruitment_staff_permit_cases')
          .update({ cancellation_finalization_email_sent_at: now, updated_at: now })
          .eq('id', record.id)
          .is('cancellation_finalization_email_sent_at', null);

        if (markError) throw markError;
        emailsSent += 1;
      } catch (emailError) {
        emailFailures += 1;
        console.error(JSON.stringify({
          level: 'error',
          event: 'sponsorship_cancellation_final_email_failed',
          permit_case_id: record.id,
          staff_id: record.staff_id,
          reason: emailError instanceof Error ? emailError.message : String(emailError),
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      finalized: Number(data || 0),
      finalEmailsSent: emailsSent,
      finalEmailFailures: emailFailures,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'sponsorship_cancellation_enforcement_failed',
      reason: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: 'Unable to enforce due sponsorship cancellations.' }, { status: 500 });
  }
}
