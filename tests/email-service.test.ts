import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setEmailSenderForTests,
  isCandidateNotifiableStatus,
  sendApplicationReceivedEmails,
  sendApplicationStatusUpdateEmails,
  sendInterviewCancelledEmails,
  sendInterviewInvitationEmails,
  sendInterviewRescheduledEmails,
} from '@/lib/email';
import type { EmailSender } from '@/lib/email/transport';
import { createFakeSupabase } from './helpers/fake-supabase';

type Sent = { to: string; subject: string; html: string; text: string };

let sent: Sent[] = [];

const sender: EmailSender = async (payload) => {
  sent.push({ to: payload.to, subject: payload.subject, html: payload.html, text: payload.text });
  return { id: `msg-${sent.length}` };
};

const irishApplication = {
  id: '3f1b9a52-7c44-4c1e-9f0a-8b7d2e5c6a11',
  full_name: 'Ada Byron',
  email: 'ada@example.com',
  phone: '+353 1 234 5678',
  role_applied: 'Support Worker',
  country_of_residence: 'Ireland',
  living_in_ireland: 'Yes',
  work_permission: 'Yes',
  status: 'Submitted',
  submitted_at: '2026-08-01T09:00:00.000Z',
};

const internationalApplication = {
  ...irishApplication,
  id: '7a2c1d40-1111-2222-3333-444455556666',
  full_name: 'Chidi Okeke',
  email: 'chidi@example.com',
  country_of_residence: 'Nigeria',
  living_in_ireland: 'No',
  work_permission: 'No',
};

const interview = {
  id: 'int-1',
  scheduled_at: '2026-09-01T09:00:00.000Z',
  duration_minutes: 45,
  location: 'Bimed office, Dublin',
  meeting_link: null,
  interviewer: 'R. Okafor',
  candidate_instructions: 'Bring photo ID.',
};

beforeEach(() => {
  sent = [];
  delete process.env.RECRUITMENT_ADMIN_EMAIL;
  __setEmailSenderForTests(sender);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  __setEmailSenderForTests(null);
  vi.restoreAllMocks();
});

describe('application submission', () => {
  it('emails the candidate and the Ireland-based internal recipients', async () => {
    const db = createFakeSupabase();
    const result = await sendApplicationReceivedEmails(irishApplication, db as never);

    expect(result.candidate.status).toBe('sent');
    expect(result.internal.every((entry) => entry.status === 'sent')).toBe(true);

    const recipients = sent.map((email) => email.to);
    expect(recipients).toContain('ada@example.com');
    expect(recipients).toContain('recruitment@bimedhealthcare.com');
    expect(recipients).toContain('manager@bimedhealthcare.com');
    expect(recipients).toContain('info@bimedhealthcare.com');
    expect(recipients).not.toContain('overseas@bimedhealthcare.com');
  });

  it('routes international candidates to the overseas inbox', async () => {
    const db = createFakeSupabase();
    await sendApplicationReceivedEmails(internationalApplication, db as never);

    const recipients = sent.map((email) => email.to);
    expect(recipients).toContain('overseas@bimedhealthcare.com');
    expect(recipients).not.toContain('recruitment@bimedhealthcare.com');

    const candidateEmail = sent.find((email) => email.to === 'chidi@example.com');
    expect(candidateEmail?.html).toContain('overseas@bimedhealthcare.com');
  });

  it('adds RECRUITMENT_ADMIN_EMAIL when configured', async () => {
    process.env.RECRUITMENT_ADMIN_EMAIL = 'recruitment-inbox@bimedhealthcare.com';
    const db = createFakeSupabase();

    await sendApplicationReceivedEmails(irishApplication, db as never);

    expect(sent.map((email) => email.to)).toContain('recruitment-inbox@bimedhealthcare.com');
  });

  it('does not resend when the same submission is replayed', async () => {
    const db = createFakeSupabase();

    await sendApplicationReceivedEmails(irishApplication, db as never);
    const firstCount = sent.length;

    const replay = await sendApplicationReceivedEmails(irishApplication, db as never);

    expect(sent).toHaveLength(firstCount);
    expect(replay.candidate).toEqual({ status: 'skipped', reason: 'duplicate' });
  });

  it('keeps the candidate email free of internal notes and links', async () => {
    const db = createFakeSupabase();
    await sendApplicationReceivedEmails(irishApplication, db as never);

    const candidateEmail = sent.find((email) => email.to === 'ada@example.com');
    expect(candidateEmail?.html).not.toContain('/admin/applications/');
    expect(candidateEmail?.html).not.toContain('Admin record');
  });
});

describe('status updates', () => {
  it('classifies which statuses are candidate-facing', () => {
    expect(isCandidateNotifiableStatus('Under Review')).toBe(true);
    expect(isCandidateNotifiableStatus('Interview')).toBe(true);
    expect(isCandidateNotifiableStatus('Rejected')).toBe(true);
    // Covered by the application-received email instead.
    expect(isCandidateNotifiableStatus('Submitted')).toBe(false);
  });

  it('emails the candidate and internal staff on a real transition', async () => {
    const db = createFakeSupabase();

    const result = await sendApplicationStatusUpdateEmails(
      {
        application: irishApplication,
        previousStatus: 'Submitted',
        status: 'Under Review',
        actor: 'admin@bimedhealthcare.com',
      },
      db as never
    );

    expect(result.candidate?.status).toBe('sent');
    const candidateEmail = sent.find((email) => email.to === 'ada@example.com');
    expect(candidateEmail?.html).toContain('Under Review');
    expect(candidateEmail?.html).not.toContain('admin@bimedhealthcare.com');

    const internalEmail = sent.find((email) => email.to === 'manager@bimedhealthcare.com');
    expect(internalEmail?.html).toContain('admin@bimedhealthcare.com');
  });

  it('skips the candidate email for a non-notifiable status but still tells staff', async () => {
    const db = createFakeSupabase();

    const result = await sendApplicationStatusUpdateEmails(
      {
        application: irishApplication,
        previousStatus: 'Under Review',
        status: 'Submitted',
        actor: 'admin@bimedhealthcare.com',
      },
      db as never
    );

    expect(result.candidate).toBeNull();
    expect(sent.some((email) => email.to === 'ada@example.com')).toBe(false);
    expect(result.internal.length).toBeGreaterThan(0);
  });

  it('honours notifyCandidate: false', async () => {
    const db = createFakeSupabase();

    const result = await sendApplicationStatusUpdateEmails(
      {
        application: irishApplication,
        previousStatus: 'Submitted',
        status: 'Interview',
        actor: 'admin@bimedhealthcare.com',
        notifyCandidate: false,
      },
      db as never
    );

    expect(result.candidate).toBeNull();
    expect(sent.some((email) => email.to === 'ada@example.com')).toBe(false);
  });

  it('suppresses a duplicate status email inside the window', async () => {
    const db = createFakeSupabase();
    const input = {
      application: irishApplication,
      previousStatus: 'Submitted',
      status: 'Under Review',
      actor: 'admin@bimedhealthcare.com',
    };

    await sendApplicationStatusUpdateEmails(input, db as never);
    const countAfterFirst = sent.filter((email) => email.to === 'ada@example.com').length;

    const second = await sendApplicationStatusUpdateEmails(input, db as never);

    expect(second.candidate).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(sent.filter((email) => email.to === 'ada@example.com')).toHaveLength(countAfterFirst);
  });
});

describe('interviews', () => {
  it('sends an invitation to the candidate and a notice to staff', async () => {
    const db = createFakeSupabase();

    const result = await sendInterviewInvitationEmails({ application: irishApplication, interview }, db as never);

    expect(result.candidate.status).toBe('sent');
    const candidateEmail = sent.find((email) => email.to === 'ada@example.com');
    expect(candidateEmail?.subject).toContain('Interview invitation');
    expect(candidateEmail?.html).toContain('Bimed office, Dublin');
    expect(candidateEmail?.html).toContain('Bring photo ID.');

    expect(sent.some((email) => email.to === 'manager@bimedhealthcare.com')).toBe(true);
  });

  it('does not resend the same invitation twice', async () => {
    const db = createFakeSupabase();

    await sendInterviewInvitationEmails({ application: irishApplication, interview }, db as never);
    const count = sent.length;
    const replay = await sendInterviewInvitationEmails({ application: irishApplication, interview }, db as never);

    expect(replay.candidate).toEqual({ status: 'skipped', reason: 'duplicate' });
    expect(sent).toHaveLength(count);
  });

  it('sends a reschedule notice with the previous time', async () => {
    const db = createFakeSupabase();

    const result = await sendInterviewRescheduledEmails(
      {
        application: irishApplication,
        interview: { ...interview, scheduled_at: '2026-09-03T09:00:00.000Z' },
        previousScheduledAt: interview.scheduled_at,
        revision: 1,
      },
      db as never
    );

    expect(result.candidate.status).toBe('sent');
    const candidateEmail = sent.find((email) => email.to === 'ada@example.com');
    expect(candidateEmail?.subject).toContain('rescheduled');
    expect(candidateEmail?.html).toContain('Previous time');
  });

  it('treats each reschedule revision as a distinct email', async () => {
    const db = createFakeSupabase();
    const base = { application: irishApplication, interview, previousScheduledAt: interview.scheduled_at };

    await sendInterviewRescheduledEmails({ ...base, revision: 1 }, db as never);
    const afterFirst = sent.filter((email) => email.to === 'ada@example.com').length;

    const second = await sendInterviewRescheduledEmails({ ...base, revision: 2 }, db as never);

    expect(second.candidate.status).toBe('sent');
    expect(sent.filter((email) => email.to === 'ada@example.com').length).toBe(afterFirst + 1);
  });

  it('sends a cancellation notice including the reason', async () => {
    const db = createFakeSupabase();

    const result = await sendInterviewCancelledEmails(
      { application: irishApplication, interview, reason: 'Interviewer unavailable' },
      db as never
    );

    expect(result.candidate.status).toBe('sent');
    const candidateEmail = sent.find((email) => email.to === 'ada@example.com');
    expect(candidateEmail?.subject).toContain('cancelled');
    expect(candidateEmail?.html).toContain('Interviewer unavailable');
  });
});

describe('graceful degradation', () => {
  it('reports not_configured instead of throwing when Resend is unset', async () => {
    __setEmailSenderForTests(null);
    delete process.env.RESEND_API_KEY;

    const db = createFakeSupabase();
    const result = await sendApplicationReceivedEmails(irishApplication, db as never);

    expect(result.candidate).toEqual({ status: 'skipped', reason: 'not_configured' });
    expect(result.internal.every((entry) => entry.status === 'skipped')).toBe(true);
  });

  it('reports a provider failure without throwing', async () => {
    __setEmailSenderForTests(async () => {
      throw new Error('422 sender not verified');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const db = createFakeSupabase();
    const result = await sendApplicationReceivedEmails(irishApplication, db as never);

    expect(result.candidate.status).toBe('failed');
  });

  it('works without a Supabase client at all', async () => {
    const result = await sendApplicationReceivedEmails(irishApplication, null);
    expect(result.candidate.status).toBe('sent');
  });
});
