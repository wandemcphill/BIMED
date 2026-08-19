import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';
import { isInternationalCandidate } from '@/lib/recruitment-config';
import { sendRecruitmentEmails } from '@/lib/email';
import { checkRateLimit } from '@/lib/rate-limit';
import { recordRecruitmentAudit } from '@/lib/recruitment-audit';

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit({
      key: 'candidate-application',
      limit: 12,
      windowMs: 60 * 60 * 1000,
      request: req,
    });

    if (!rateLimit.allowed) {
      const init: ResponseInit = { status: 429 };
      if (rateLimit.retryAfterSeconds) {
        init.headers = {
          'Retry-After': String(rateLimit.retryAfterSeconds),
        };
      }

      return NextResponse.json({ error: 'Too many submissions from this network. Please try again later.' }, init);
    }

    const body = await req.json();

    if (!body.token) {
      return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });
    }

    const client = db();
    const { data: invite, error: inviteError } = await client
      .from('recruitment_invites')
      .select('*')
      .eq('token_hash', hashToken(body.token))
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }

    if (invite.used_at) {
      return NextResponse.json({ error: 'This invitation has already been used.' }, { status: 409 });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This invitation has expired.' }, { status: 410 });
    }

    if (!body.full_name || !body.email || !body.country_of_residence || !body.role_applied || !body.living_in_ireland || !body.consent) {
      return NextResponse.json({ error: 'Required fields are missing.' }, { status: 400 });
    }

    const international = isInternationalCandidate(body);

    if (international) {
      if (!body.current_country || !body.work_permission || !body.requires_employment_permit || !body.relocation_readiness) {
        return NextResponse.json({ error: 'International pathway questions are incomplete.' }, { status: 400 });
      }
    }

    const payload = {
      invite_id: invite.id,
      full_name: body.full_name,
      preferred_name: body.preferred_name || null,
      email: body.email,
      phone: body.phone || null,
      date_of_birth: body.date_of_birth || null,
      nationality: body.nationality || null,
      country_of_residence: body.country_of_residence || null,
      address: body.address || null,
      role_applied: body.role_applied,
      employment_type: body.employment_type || null,
      availability: body.availability || null,
      start_date: body.start_date || null,
      driving_licence: body.driving_licence || null,
      vehicle_access: body.vehicle_access || null,
      care_experience: body.care_experience || null,
      qualifications: body.qualifications || null,
      training: body.training || null,
      professional_experience: body.professional_experience || null,
      employment_history: body.employment_history || null,
      employment_gaps: body.employment_gaps || null,
      professional_references: body.references || null,
      living_in_ireland: body.living_in_ireland || null,
      current_country: body.current_country || null,
      work_permission: body.work_permission || null,
      requires_employment_permit: body.requires_employment_permit || null,
      international_experience: body.international_experience || null,
      relocation_readiness: body.relocation_readiness || null,
      supporting_documents: body.supporting_documents || [],
      consent: true,
      status: 'Submitted',
      updated_at: new Date().toISOString(),
    };

    const { data: application, error: applicationError } = await client
      .from('recruitment_applications')
      .insert(payload)
      .select('*')
      .single();

    if (applicationError) {
      throw applicationError;
    }

    const { error: markUsedError } = await client
      .from('recruitment_invites')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invite.id);

    if (markUsedError) {
      throw markUsedError;
    }

    await recordRecruitmentAudit(client, {
      applicationId: application.id,
      inviteId: invite.id,
      eventType: 'application_submitted',
      actor: 'candidate',
      metadata: {
        country_of_residence: application.country_of_residence,
        role_applied: application.role_applied,
        living_in_ireland: application.living_in_ireland,
      },
    });

    await sendRecruitmentEmails(application);

    return NextResponse.json({ ok: true, id: application.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
