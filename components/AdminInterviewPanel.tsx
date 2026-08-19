'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

type InterviewRecord = {
  id: string;
  scheduled_at: string;
  duration_minutes: number | null;
  location: string | null;
  meeting_link: string | null;
  interviewer: string | null;
  candidate_instructions: string | null;
  status: string;
  reschedule_count: number;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type InterviewForm = {
  scheduled_at: string;
  duration_minutes: string;
  location: string;
  meeting_link: string;
  interviewer: string;
  candidate_instructions: string;
};

const emptyForm: InterviewForm = {
  scheduled_at: '',
  duration_minutes: '45',
  location: '',
  meeting_link: '',
  interviewer: '',
  candidate_instructions: '',
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Converts a stored ISO instant into the local value a datetime-local input expects. */
function toInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminInterviewPanel({
  applicationId,
  onStatusChanged,
}: {
  applicationId: string;
  onStatusChanged?: () => void;
}) {
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [form, setForm] = useState<InterviewForm>(emptyForm);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}/interviews`);

    if (!response.ok) {
      setError('Unable to load interview records.');
      return;
    }

    const payload = await response.json();
    setInterviews(payload.interviews || []);
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const describeEmail = (email: { status?: string; reason?: string } | null | undefined) => {
    if (!email) {
      return '';
    }

    if (email.status === 'sent') {
      return ' The candidate has been emailed.';
    }

    if (email.status === 'skipped' && email.reason === 'not_configured') {
      return ' Email was not sent: RESEND_API_KEY is not configured.';
    }

    if (email.status === 'skipped' && email.reason === 'duplicate') {
      return ' A matching email was already sent, so it was not sent again.';
    }

    return ' The record was saved, but the candidate email could not be delivered. Check the server logs.';
  };

  const schedule = async () => {
    setError('');
    setMessage('');

    if (!form.scheduled_at) {
      setError('Choose an interview date and time.');
      return;
    }

    setBusy(true);

    try {
      const isReschedule = Boolean(rescheduleId);
      const response = await fetch(`/api/admin/applications/${applicationId}/interviews`, {
        method: isReschedule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isReschedule ? { interview_id: rescheduleId, action: 'reschedule' } : {}),
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
          location: form.location,
          meeting_link: form.meeting_link,
          interviewer: form.interviewer,
          candidate_instructions: form.candidate_instructions,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to save the interview.');
        return;
      }

      setMessage(`${isReschedule ? 'Interview rescheduled.' : 'Interview scheduled.'}${describeEmail(payload.email)}`);
      setForm(emptyForm);
      setRescheduleId(null);
      await load();
      onStatusChanged?.();
    } catch {
      setError('Unable to save the interview right now.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (interview: InterviewRecord) => {
    const reason = window.prompt('Reason for cancelling (optional, included in the candidate email):') ?? '';

    setError('');
    setMessage('');
    setBusy(true);

    try {
      const response = await fetch(`/api/admin/applications/${applicationId}/interviews`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: interview.id, action: 'cancel', reason }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to cancel the interview.');
        return;
      }

      setMessage(`Interview cancelled.${describeEmail(payload.email)}`);
      await load();
    } catch {
      setError('Unable to cancel the interview right now.');
    } finally {
      setBusy(false);
    }
  };

  const startReschedule = (interview: InterviewRecord) => {
    setRescheduleId(interview.id);
    setMessage('');
    setError('');
    setForm({
      scheduled_at: toInputValue(interview.scheduled_at),
      duration_minutes: interview.duration_minutes ? String(interview.duration_minutes) : '',
      location: interview.location || '',
      meeting_link: interview.meeting_link || '',
      interviewer: interview.interviewer || '',
      candidate_instructions: interview.candidate_instructions || '',
    });
  };

  const activeInterviews = interviews.filter((interview) => interview.status !== 'Cancelled');

  return (
    <section className="subcard">
      <h2>Interviews</h2>
      <p className="muted">
        Scheduling an interview moves the application to the <strong>Interview</strong> status and emails the candidate. Times are
        entered and shown in this browser&apos;s local time; candidate emails state Irish time.
      </p>

      {interviews.length > 0 && (
        <div className="activity-list" style={{ marginBottom: 16 }}>
          {interviews.map((interview) => (
            <article className="activity-item" key={interview.id}>
              <div className="activity-heading">
                <strong>{formatDateTime(interview.scheduled_at)}</strong>
                <span>{interview.status}</span>
              </div>
              <p className="muted">
                {interview.duration_minutes ? `${interview.duration_minutes} minutes` : 'Duration not set'}
                {interview.location ? ` - ${interview.location}` : ''}
                {interview.interviewer ? ` - ${interview.interviewer}` : ''}
                {interview.reschedule_count > 0 ? ` - rescheduled ${interview.reschedule_count}x` : ''}
              </p>
              {interview.cancellation_reason && <p className="muted">Cancellation reason: {interview.cancellation_reason}</p>}
              {interview.status !== 'Cancelled' && (
                <div className="toolbar" style={{ marginTop: 8 }}>
                  <button className="secondary" disabled={busy} onClick={() => startReschedule(interview)}>
                    Reschedule
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => void cancel(interview)}>
                    Cancel interview
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <h3>{rescheduleId ? 'Reschedule interview' : 'Schedule an interview'}</h3>
      {!rescheduleId && activeInterviews.length > 0 && (
        <p className="muted">This candidate already has an active interview. Reschedule it above rather than adding a second one.</p>
      )}

      <div className="grid">
        <Field label="Date and time">
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(event) => setForm({ ...form, scheduled_at: event.target.value })}
          />
        </Field>
        <Field label="Duration (minutes)">
          <input
            type="number"
            min={5}
            max={480}
            value={form.duration_minutes}
            onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })}
          />
        </Field>
        <Field label="Location">
          <input
            value={form.location}
            placeholder="Bimed office, Dublin / Online"
            onChange={(event) => setForm({ ...form, location: event.target.value })}
          />
        </Field>
        <Field label="Meeting link (optional)">
          <input
            value={form.meeting_link}
            placeholder="https://..."
            onChange={(event) => setForm({ ...form, meeting_link: event.target.value })}
          />
        </Field>
        <Field label="Interviewer">
          <input value={form.interviewer} onChange={(event) => setForm({ ...form, interviewer: event.target.value })} />
        </Field>
      </div>

      <Field label="Instructions for the candidate" full>
        <textarea
          value={form.candidate_instructions}
          onChange={(event) => setForm({ ...form, candidate_instructions: event.target.value })}
        />
      </Field>

      <div className="toolbar">
        <button className="primary" disabled={busy} onClick={() => void schedule()}>
          {busy ? 'Saving...' : rescheduleId ? 'Save new time and notify' : 'Schedule and notify candidate'}
        </button>
        {rescheduleId && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setRescheduleId(null);
              setForm(emptyForm);
            }}
          >
            Cancel edit
          </button>
        )}
      </div>

      {message && (
        <div className="success" style={{ marginTop: 12 }}>
          {message}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
