'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { candidateSupportDocuments, recruitmentStatuses, isInternationalCandidate } from '@/lib/recruitment-config';

type ApplicationRecord = {
  id: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  country_of_residence: string | null;
  address: string | null;
  role_applied: string | null;
  employment_type: string | null;
  availability: string | null;
  start_date: string | null;
  driving_licence: string | null;
  vehicle_access: string | null;
  care_experience: string | null;
  qualifications: string | null;
  training: string | null;
  professional_experience: string | null;
  employment_history: string | null;
  employment_gaps: string | null;
  professional_references: string | null;
  living_in_ireland: string | null;
  current_country: string | null;
  work_permission: string | null;
  requires_employment_permit: string | null;
  international_experience: string | null;
  relocation_readiness: string | null;
  supporting_documents: string[];
  consent: boolean;
  status: string;
  admin_notes: string | null;
  submitted_at: string;
  updated_at: string | null;
  invite_id: string | null;
};

type AuditLogEntry = {
  id: string;
  event_type: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ApplicationPayload = {
  application: ApplicationRecord;
  invite?: {
    candidate_name?: string | null;
    candidate_email?: string | null;
    role?: string | null;
    expires_at?: string | null;
    used_at?: string | null;
  };
  auditLog?: AuditLogEntry[];
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === '' ? 'Not set' : String(value)}</strong>
    </div>
  );
}

export default function AdminApplicationDetail({
  applicationId,
}: {
  applicationId: string;
}) {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [message, setMessage] = useState('');
  const [payload, setPayload] = useState<ApplicationPayload | null>(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');

  const loadApplication = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}`);

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
      }

      setMessage('Unable to load the candidate record.');
      setPayload(null);
      setBootstrapping(false);
      return;
    }

    const nextPayload = (await response.json()) as ApplicationPayload;
    setPayload(nextPayload);
    setStatus(nextPayload.application.status);
    setNotes(nextPayload.application.admin_notes || '');
    setAuthenticated(true);
    setBootstrapping(false);
  };

  const checkSession = async () => {
    const response = await fetch('/api/admin/session');
    const payload = await response.json();

    if (payload.authenticated) {
      await loadApplication();
    } else {
      setAuthenticated(false);
      setBootstrapping(false);
    }
  };

  useEffect(() => {
    void checkSession();
  }, []);

  const login = async () => {
    setLoginError('');

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setLoginError(payload.error || 'Incorrect admin password.');
      return;
    }

    setPassword('');
    setAuthenticated(true);
    await loadApplication();
  };

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' });
    setAuthenticated(false);
    setPayload(null);
    setPassword('');
    setLoginError('');
    setMessage('');
  };

  const saveChanges = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        notes,
      }),
    });

    const nextPayload = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
      }

      setMessage(nextPayload.error || 'Unable to update application.');
      return;
    }

    setPayload((current) =>
      current
        ? {
            ...current,
            application: nextPayload.application,
          }
        : current
    );
    setMessage('Candidate record updated.');
  };

  if (bootstrapping) {
    return (
      <section className="card auth-card">
        <h1>Candidate record</h1>
        <p className="muted">Checking your admin session...</p>
      </section>
    );
  }

  if (!authenticated || !payload) {
    return (
      <section className="card auth-card">
        <h1>Candidate record</h1>
        <p className="muted">Sign in to view the private candidate record.</p>
        <Field label="Admin password">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void login();
              }
            }}
          />
        </Field>
        <button className="primary" onClick={() => void login()}>
          Sign in
        </button>
        {loginError && <div className="error">{loginError}</div>}
      </section>
    );
  }

  const application = payload.application;
  const international = isInternationalCandidate(application);

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="pill">CANDIDATE RECORD</span>
          <h1>{application.full_name}</h1>
          <p className="muted">
            {application.role_applied || 'No role set'} - {international ? 'International' : 'Ireland-based'} - Submitted{' '}
            {formatDate(application.submitted_at)}
          </p>
        </div>
        <div className="toolbar">
          <a className="secondary link-button" href="/admin">
            Back to dashboard
          </a>
          <button className="secondary" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>

      <section className="subcard">
        <h2>Admin controls</h2>
        <div className="grid">
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {recruitmentStatuses.map((statusValue) => (
                <option key={statusValue}>{statusValue}</option>
              ))}
            </select>
          </Field>
          <Field label="Submitted">
            <input value={formatDate(application.submitted_at)} readOnly />
          </Field>
          <Field label="Last updated">
            <input value={formatDate(application.updated_at)} readOnly />
          </Field>
          <Field label="Application source">
            <input value={payload.invite?.candidate_email || application.email} readOnly />
          </Field>
        </div>
        <Field label="Admin notes" full>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <button className="primary" onClick={() => void saveChanges()}>
          Save changes
        </button>
        {message && <div className="success" style={{ marginTop: 12 }}>{message}</div>}
      </section>

      <div className="detail-grid">
        <section className="subcard">
          <h2>Personal information</h2>
          <DetailRow label="Full legal name" value={application.full_name} />
          <DetailRow label="Preferred name" value={application.preferred_name} />
          <DetailRow label="Email" value={application.email} />
          <DetailRow label="Phone" value={application.phone} />
          <DetailRow label="Date of birth" value={application.date_of_birth} />
          <DetailRow label="Nationality" value={application.nationality} />
          <DetailRow label="Country of residence" value={application.country_of_residence} />
          <DetailRow label="Address" value={application.address} />
        </section>

        <section className="subcard">
          <h2>Role and availability</h2>
          <DetailRow label="Position applied for" value={application.role_applied} />
          <DetailRow label="Employment type" value={application.employment_type} />
          <DetailRow label="Availability" value={application.availability} />
          <DetailRow label="Preferred start date" value={application.start_date} />
          <DetailRow label="Driving licence" value={application.driving_licence} />
          <DetailRow label="Access to vehicle" value={application.vehicle_access} />
        </section>
      </div>

      <div className="detail-grid">
        <section className="subcard">
          <h2>Experience and qualifications</h2>
          <DetailRow label="Care / healthcare experience" value={application.care_experience} />
          <DetailRow label="Qualifications" value={application.qualifications} />
          <DetailRow label="Training" value={application.training} />
          <DetailRow label="Professional experience" value={application.professional_experience} />
        </section>

        <section className="subcard">
          <h2>Employment and references</h2>
          <DetailRow label="Employment history" value={application.employment_history} />
          <DetailRow label="Employment gaps" value={application.employment_gaps} />
          <DetailRow label="References" value={application.professional_references} />
        </section>
      </div>

      <section className="subcard">
        <h2>Ireland / international pathway</h2>
        <div className="grid">
          <DetailRow label="Living in Ireland" value={application.living_in_ireland} />
          <DetailRow label="Current country" value={application.current_country} />
          <DetailRow label="Work permission in Ireland" value={application.work_permission} />
          <DetailRow label="Employment permit required" value={application.requires_employment_permit} />
          <DetailRow label="Relocation readiness" value={application.relocation_readiness} />
          <DetailRow label="International work experience" value={application.international_experience} />
        </div>
        {international && (
          <div className="notice" style={{ marginTop: 12 }}>
            <b>International route:</b> employment permit and immigration requirements must be satisfied before lawful commencement
            of employment.
          </div>
        )}
      </section>

      <section className="subcard">
        <h2>Supporting documents</h2>
        <div className="document-list">
          {candidateSupportDocuments.map((documentName) => (
            <span
              className={application.supporting_documents.includes(documentName) ? 'document-tag selected' : 'document-tag'}
              key={documentName}
            >
              {documentName}
            </span>
          ))}
        </div>
      </section>

      <section className="subcard">
        <h2>Consent</h2>
        <DetailRow label="Consent given" value={application.consent ? 'Yes' : 'No'} />
      </section>

      <section className="subcard">
        <h2>Activity log</h2>
        {payload.auditLog?.length ? (
          <div className="activity-list">
            {payload.auditLog.map((entry) => (
              <article className="activity-item" key={entry.id}>
                <div className="activity-heading">
                  <strong>{entry.event_type}</strong>
                  <span>{formatDate(entry.created_at)}</span>
                </div>
                <p className="muted">Actor: {entry.actor}</p>
                {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                  <pre className="activity-metadata">{JSON.stringify(entry.metadata, null, 2)}</pre>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No activity recorded yet.</p>
        )}
      </section>
    </section>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
