import { describe, expect, it } from 'vitest';
import {
  adminInterviewNotificationEmail,
  adminNewApplicationEmail,
  adminPasswordResetEmail,
  adminStatusChangeNotificationEmail,
  applicationReceivedEmail,
  applicationReference,
  applicationStatusUpdateEmail,
  escapeHtml,
  interviewCancelledEmail,
  interviewInvitationEmail,
  interviewRescheduledEmail,
  safeUrl,
  sanitizeSubject,
} from '@/lib/email/templates';

const APPLICATION_ID = '3f1b9a52-7c44-4c1e-9f0a-8b7d2e5c6a11';

describe('escaping and sanitisation', () => {
  it('escapes HTML control characters', () => {
    expect(escapeHtml(`<script>alert("x")&'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;');
  });

  it('does not render candidate-supplied HTML into the body', () => {
    const email = applicationReceivedEmail({
      candidateName: '<img src=x onerror=alert(1)>',
      role: 'Support Worker',
      applicationId: APPLICATION_ID,
      supportingDocumentsEmail: 'recruitment@bimedhealthcare.com',
    });

    expect(email.html).not.toContain('<img src=x');
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('strips CR/LF from subjects so headers cannot be injected', () => {
    const subject = sanitizeSubject('Interview\r\nBcc: attacker@example.com');
    expect(subject).toBe('Interview Bcc: attacker@example.com');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('strips control characters and caps subject length', () => {
    expect(sanitizeSubject('a\u0000b\u007fc')).toBe('abc');
    expect(sanitizeSubject('x'.repeat(400)).length).toBe(200);
  });

  it('keeps user-supplied newlines out of generated subjects', () => {
    const email = adminNewApplicationEmail({
      candidateName: 'Ada\r\nBcc: attacker@example.com',
      candidateEmail: 'ada@example.com',
      pathway: 'Ireland-based',
      submittedLabel: '1 Jan 2026, 09:00',
      adminRecordUrl: 'https://recruitment.bimedhealthcare.com/admin/applications/1',
      applicationId: APPLICATION_ID,
    });

    expect(email.subject).not.toMatch(/[\r\n]/);
  });
});

describe('safeUrl', () => {
  it('accepts http and https', () => {
    expect(safeUrl('https://meet.example.com/abc')).toBe('https://meet.example.com/abc');
    expect(safeUrl('http://meet.example.com/abc')).toBe('http://meet.example.com/abc');
  });

  it('rejects dangerous or malformed schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>')).toBeNull();
    expect(safeUrl('mailto:someone@example.com')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it('never renders a rejected meeting link as a button', () => {
    const email = interviewInvitationEmail({
      candidateName: 'Ada Byron',
      role: 'Support Worker',
      applicationId: APPLICATION_ID,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      meetingLink: 'javascript:alert(1)',
    });

    expect(email.html).not.toContain('javascript:');
    expect(email.html).not.toContain('Join the interview');
  });
});

describe('application reference', () => {
  it('derives a stable short reference from the application id', () => {
    expect(applicationReference(APPLICATION_ID)).toBe('BIMED-3F1B9A52');
    expect(applicationReference(APPLICATION_ID)).toBe(applicationReference(APPLICATION_ID));
  });
});

describe('candidate templates', () => {
  it('application received includes role, reference and document routing', () => {
    const email = applicationReceivedEmail({
      candidateName: 'Ada Byron',
      role: 'Healthcare Assistant',
      applicationId: APPLICATION_ID,
      supportingDocumentsEmail: 'overseas@bimedhealthcare.com',
    });

    expect(email.subject).toBe('Bimed Healthcare recruitment application received');
    expect(email.html).toContain('Ada Byron');
    expect(email.html).toContain('Healthcare Assistant');
    expect(email.html).toContain('BIMED-3F1B9A52');
    expect(email.html).toContain('overseas@bimedhealthcare.com');
    expect(email.text).toContain('overseas@bimedhealthcare.com');
  });

  it('status update states the status and the next step', () => {
    const email = applicationStatusUpdateEmail({
      candidateName: 'Ada Byron',
      role: 'Support Worker',
      applicationId: APPLICATION_ID,
      status: 'Under Review',
      nextSteps: 'Your application is being reviewed.',
    });

    expect(email.html).toContain('Under Review');
    expect(email.html).toContain('Your application is being reviewed.');
    expect(email.text).toContain('Status: Under Review');
  });

  it('interview invitation carries the time, location and Irish timezone', () => {
    const email = interviewInvitationEmail({
      candidateName: 'Ada Byron',
      role: 'Support Worker',
      applicationId: APPLICATION_ID,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      durationMinutes: 45,
      location: 'Bimed office, Dublin',
      interviewer: 'R. Okafor',
      meetingLink: 'https://meet.example.com/bimed',
    });

    expect(email.subject).toContain('Interview invitation');
    expect(email.html).toContain('Bimed office, Dublin');
    expect(email.html).toContain('45 minutes');
    expect(email.html).toContain('Europe/Dublin');
    expect(email.html).toContain('https://meet.example.com/bimed');
    // 09:00 UTC is 10:00 Irish summer time.
    expect(email.html).toContain('10:00');
  });

  it('reschedule shows both the old and new time', () => {
    const email = interviewRescheduledEmail({
      candidateName: 'Ada Byron',
      applicationId: APPLICATION_ID,
      scheduledAt: '2026-09-03T09:00:00.000Z',
      previousScheduledAt: '2026-09-01T09:00:00.000Z',
    });

    expect(email.subject).toContain('rescheduled');
    expect(email.html).toContain('Previous time');
    expect(email.html).toContain('New date and time');
  });

  it('cancellation includes the reason when supplied', () => {
    const email = interviewCancelledEmail({
      candidateName: 'Ada Byron',
      applicationId: APPLICATION_ID,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      reason: 'Interviewer unavailable',
    });

    expect(email.subject).toContain('cancelled');
    expect(email.html).toContain('Interviewer unavailable');
  });

  it('handles an unparseable interview date without crashing', () => {
    const email = interviewInvitationEmail({
      candidateName: 'Ada Byron',
      applicationId: APPLICATION_ID,
      scheduledAt: 'not-a-date',
    });

    expect(email.html).toContain('To be confirmed');
  });
});

describe('admin templates', () => {
  it('new application notification links to the admin record', () => {
    const email = adminNewApplicationEmail({
      candidateName: 'Ada Byron',
      candidateEmail: 'ada@example.com',
      phone: '+353 1 234 5678',
      role: 'Support Worker',
      countryOfResidence: 'Nigeria',
      pathway: 'International',
      workPermission: 'No',
      submittedLabel: '1 Jan 2026, 09:00',
      adminRecordUrl: 'https://recruitment.bimedhealthcare.com/admin/applications/abc',
      applicationId: APPLICATION_ID,
    });

    expect(email.subject).toBe('New Bimed Healthcare application: Ada Byron');
    expect(email.html).toContain('https://recruitment.bimedhealthcare.com/admin/applications/abc');
    expect(email.html).toContain('International');
  });

  it('interview notification reflects the action', () => {
    const email = adminInterviewNotificationEmail({
      action: 'cancelled',
      candidateName: 'Ada Byron',
      applicationId: APPLICATION_ID,
      scheduledAt: '2026-09-01T09:00:00.000Z',
      adminRecordUrl: 'https://recruitment.bimedhealthcare.com/admin/applications/abc',
    });

    expect(email.subject).toBe('Interview cancelled: Ada Byron');
    expect(email.html).toContain('Cancelled interview');
  });

  it('status change notification shows the transition and actor', () => {
    const email = adminStatusChangeNotificationEmail({
      candidateName: 'Ada Byron',
      applicationId: APPLICATION_ID,
      previousStatus: 'Submitted',
      status: 'Interview',
      actor: 'admin@bimedhealthcare.com',
      adminRecordUrl: 'https://recruitment.bimedhealthcare.com/admin/applications/abc',
    });

    expect(email.html).toContain('Submitted');
    expect(email.html).toContain('Interview');
    expect(email.html).toContain('admin@bimedhealthcare.com');
  });
});

describe('password reset template', () => {
  it('includes the single-use link and expiry, and no credentials', () => {
    const email = adminPasswordResetEmail({
      displayName: 'Bimed Administrator',
      resetUrl: 'https://recruitment.bimedhealthcare.com/admin/reset-password?token=abc123',
      expiryMinutes: 30,
    });

    expect(email.html).toContain('reset-password?token=abc123');
    expect(email.html).toContain('30 minutes');
    expect(email.html).toContain('only be used once');
    expect(email.html.toLowerCase()).not.toContain('your password is');
  });
});

describe('every template', () => {
  const all = [
    applicationReceivedEmail({
      candidateName: 'A',
      applicationId: APPLICATION_ID,
      supportingDocumentsEmail: 'recruitment@bimedhealthcare.com',
    }),
    applicationStatusUpdateEmail({
      candidateName: 'A',
      applicationId: APPLICATION_ID,
      status: 'Interview',
      nextSteps: 'Next',
    }),
    interviewInvitationEmail({ candidateName: 'A', applicationId: APPLICATION_ID, scheduledAt: '2026-09-01T09:00:00.000Z' }),
    interviewRescheduledEmail({ candidateName: 'A', applicationId: APPLICATION_ID, scheduledAt: '2026-09-01T09:00:00.000Z' }),
    interviewCancelledEmail({ candidateName: 'A', applicationId: APPLICATION_ID, scheduledAt: '2026-09-01T09:00:00.000Z' }),
    adminNewApplicationEmail({
      candidateName: 'A',
      candidateEmail: 'a@example.com',
      pathway: 'Ireland-based',
      submittedLabel: 'now',
      adminRecordUrl: 'https://example.com/admin',
      applicationId: APPLICATION_ID,
    }),
    adminPasswordResetEmail({ displayName: 'A', resetUrl: 'https://example.com/r', expiryMinutes: 30 }),
  ];

  it('produces a subject, a mobile-responsive HTML body and a text alternative', () => {
    for (const email of all) {
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain('width=device-width');
      expect(email.html).toContain('max-width:600px');
      expect(email.html).toContain('Bimed Healthcare');
      expect(email.text.length).toBeGreaterThan(0);
      expect(email.text).not.toContain('<td');
    }
  });
});
