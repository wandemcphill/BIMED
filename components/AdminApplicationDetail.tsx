'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { candidateSupportDocuments, isInternationalCandidate } from '@/lib/recruitment-config';
import { contractTemplates, guessContractRoleSlug } from '@/lib/contract-templates';
import { FIRST_INTERVIEW_ALL_QUESTIONS, getSecondInterviewQuestions } from '@/lib/interview-questions';
import { getBimedStatusOptions } from '@/lib/bimed-lifecycle';
import AdminInterviewPanel from '@/components/AdminInterviewPanel';

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
  interview_responses: Record<string, { text?: string; audio_path?: string }> | null;
};

type SecondInterview = {
  id: string;
  status: 'sent' | 'completed';
  answers: Record<string, string | { audio_path: string; mime_type: string }> | null;
  sent_at: string;
  completed_at: string | null;
  expires_at: string | null;
};

type ContractSignature = {
  id: string;
  role_slug: string;
  status: 'issued' | 'signed';
  signed_name: string | null;
  signed_at: string | null;
  issued_at: string;
  expires_at: string | null;
};

type ExternalContractVerification = {
  id: string;
  application_id: string;
  role_slug: string;
  source: 'email';
  verified_by: string;
  verified_at: string;
  note: string;
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
  interviewAudioUrls?: Record<string, string>;
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
  const router = useRouter();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [payload, setPayload] = useState<ApplicationPayload | null>(null);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [contractRoleSlug, setContractRoleSlug] = useState('');
  const [signatures, setSignatures] = useState<ContractSignature[]>([]);
  const [externalContractVerification, setExternalContractVerification] = useState<ExternalContractVerification | null>(null);
  const [externalContractNote, setExternalContractNote] = useState('');
  const [recordingExternalContract, setRecordingExternalContract] = useState(false);
  const [issuingPack, setIssuingPack] = useState(false);
  const [packMessage, setPackMessage] = useState('');
  const [secondInterviews, setSecondInterviews] = useState<SecondInterview[]>([]);
  const [secondInterviewAudioUrls, setSecondInterviewAudioUrls] = useState<Record<string, Record<string, string>>>({});
  const [sendingSecondInterview, setSendingSecondInterview] = useState(false);
  const [secondInterviewMessage, setSecondInterviewMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [handbookSignatures, setHandbookSignatures] = useState<ContractSignature[]>([]);
  const [jobDescSignatures, setJobDescSignatures] = useState<ContractSignature[]>([]);

  const loadApplication = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}`);

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
        setAdminEmail('');
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
    setContractRoleSlug(guessContractRoleSlug(nextPayload.application.role_applied));
    setAuthenticated(true);
    setBootstrapping(false);
    await loadSignatures();
    await loadSecondInterviews();
    await loadHandbookSignatures();
    await loadJobDescSignatures();
  };

  const loadSignatures = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}/contract-signature`);
    if (!response.ok) return;
    const nextPayload = (await response.json()) as {
      signatures: ContractSignature[];
      externalVerification?: ExternalContractVerification | null;
    };
    setSignatures(nextPayload.signatures || []);
    setExternalContractVerification(nextPayload.externalVerification || null);
  };

  const loadHandbookSignatures = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}/document-signature?doc_type=handbook`);
    if (!response.ok) return;
    const nextPayload = (await response.json()) as { signatures: ContractSignature[] };
    setHandbookSignatures(nextPayload.signatures || []);
  };

  const loadJobDescSignatures = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}/document-signature?doc_type=job_description`);
    if (!response.ok) return;
    const nextPayload = (await response.json()) as { signatures: ContractSignature[] };
    setJobDescSignatures(nextPayload.signatures || []);
  };

  const loadSecondInterviews = async () => {
    const response = await fetch(`/api/admin/applications/${applicationId}/second-interview`);
    if (!response.ok) return;
    const nextPayload = (await response.json()) as {
      interviews: SecondInterview[];
      audioUrlsByInterview: Record<string, Record<string, string>>;
    };
    setSecondInterviews(nextPayload.interviews || []);
    setSecondInterviewAudioUrls(nextPayload.audioUrlsByInterview || {});
  };

  const sendSecondInterview = async () => {
    setSendingSecondInterview(true);
    setSecondInterviewMessage('');

    const response = await fetch(`/api/admin/applications/${applicationId}/second-interview`, { method: 'POST' });
    const nextPayload = await response.json();
    setSendingSecondInterview(false);

    if (!response.ok) {
      setSecondInterviewMessage(nextPayload.error || 'Unable to send the second interview.');
      return;
    }

    setSecondInterviewMessage(
      nextPayload.email?.status === 'sent'
        ? 'Second interview emailed to the candidate.'
        : 'Second interview created, but the email could not be confirmed as sent. Check the candidate email delivery.'
    );
    await loadSecondInterviews();
  };

  const deleteApplication = async () => {
    if (!payload) return;
    const confirmed = window.confirm(
      `Permanently delete ${payload.application.full_name}'s application? This removes their answers, interviews, contract signatures and any voice notes. This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const response = await fetch(`/api/admin/applications/${applicationId}`, { method: 'DELETE' });

    if (!response.ok) {
      const nextPayload = await response.json().catch(() => ({}));
      setDeleting(false);
      setMessage(nextPayload.error || 'Unable to delete this application.');
      return;
    }

    router.push('/admin');
  };

  const recordExternalContract = async () => {
    const note = externalContractNote.trim();
    if (!note) {
      setSignatureMessage('Add a note confirming that the signed contract was received and checked by email.');
      return;
    }

    const confirmed = window.confirm(
      'Confirm that BIMED has received and reviewed a signed contract from the candidate outside the portal. The portal e-signature record will remain independent.'
    );
    if (!confirmed) return;

    setRecordingExternalContract(true);
    setSignatureMessage('');

    const response = await fetch(`/api/admin/applications/${applicationId}/contract-signature/external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_slug: contractRoleSlug, note }),
    });

    const nextPayload = await response.json();
    setRecordingExternalContract(false);

    if (!response.ok) {
      setSignatureMessage(nextPayload.error || 'Unable to record the external signed contract.');
      return;
    }

    setExternalContractVerification(nextPayload.verification || null);
    setExternalContractNote('');
    setSignatureMessage('External signed contract recorded and verified. Staff portal provisioning can now use this contract evidence.');
  };

  const issueOnboardingPack = async () => {
    setIssuingPack(true);
    setPackMessage('');

    const response = await fetch(`/api/admin/applications/${applicationId}/onboarding-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_slug: contractRoleSlug }),
    });

    const nextPayload = await response.json();
    setIssuingPack(false);

    if (!response.ok) {
      setPackMessage(nextPayload.error || 'Unable to send the onboarding pack.');
      return;
    }

    setPackMessage(
      nextPayload.email?.status === 'sent'
        ? 'Complete onboarding pack emailed. Any document already signed remains signed and is not re-issued.'
        : 'Complete onboarding pack created, but the email could not be confirmed as sent. Check the candidate email delivery.'
    );
    setStatus('Offer Issued');
    await loadSignatures();
  };

  const checkSession = async () => {
    const response = await fetch('/api/admin/session');
    const payload = await response.json();

    if (payload.authenticated) {
      setAdminEmail(payload.email || '');
      await loadApplication();
    } else {
      setAuthenticated(false);
      setAdminEmail('');
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
      body: JSON.stringify({ email: loginEmail, password }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setLoginError(payload.error || 'Incorrect admin credentials.');
      return;
    }

    setAdminEmail(payload.email || loginEmail);
    setLoginEmail('');
    setPassword('');
    setAuthenticated(true);
    await loadApplication();
  };

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' });
    setAuthenticated(false);
    setPayload(null);
    setAdminEmail('');
    setLoginEmail('');
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
      if (response.status === 409 && payload?.application.status) {
        setStatus(payload.application.status);
      }

      setMessageTone('error');
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

    // Tell the admin whether the status change actually reached the candidate.
    const statusEmail = nextPayload.statusEmail as { status?: string; reason?: string } | null | undefined;
    let emailNote = '';

    if (statusEmail?.status === 'sent') {
      emailNote = ' The candidate has been emailed about the new status.';
    } else if (statusEmail?.status === 'skipped' && statusEmail.reason === 'not_configured') {
      emailNote = ' No candidate email was sent: RESEND_API_KEY is not configured.';
    } else if (statusEmail?.status === 'skipped' && statusEmail.reason === 'duplicate') {
      emailNote = ' A matching status email was already sent recently, so it was not repeated.';
    } else if (statusEmail?.status === 'failed') {
      emailNote = ' The record was saved, but the candidate status email could not be delivered. Check the server logs.';
    }

    setMessageTone('success');
    setMessage(`Candidate record updated.${emailNote}`);
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
  const onboardingPackSent = Boolean(payload.auditLog?.some((entry) => entry.event_type === 'onboarding_pack_sent'));
      return (
      <section className="card auth-card">
        <h1>Candidate record</h1>
        <p className="muted">Sign in to view the private candidate record.</p>
        <Field label="Admin email">
          <input
            type="email"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void login();
              }
            }}
          />
        </Field>
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
        <p className="muted" style={{ marginTop: 16 }}>
          <a href="/admin/forgot-password">Forgot your password?</a>
        </p>
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
          {adminEmail && <span className="muted">Signed in as {adminEmail}</span>}
          <a className="secondary link-button" href="/admin">
            Back to dashboard
          </a>
          <button className="secondary danger" onClick={() => void deleteApplication()} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete application'}
          </button>
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
              {getBimedStatusOptions(application.status).map((statusValue) => (
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
        {message && <div className={messageTone} style={{ marginTop: 12 }}>{message}</div>}
      </section>

      <section className="subcard">
        <h2>Generate contract</h2>
        <p className="muted">
          Opens the contract pre-filled with this candidate&apos;s name, address and start date. Line manager and pay still need
          to be confirmed before issue.
        </p>
        <div className="grid">
          <Field label="Contract role">
            <select value={contractRoleSlug} onChange={(event) => setContractRoleSlug(event.target.value)}>
              {contractTemplates.map((template) => (
                <option key={template.roleSlug} value={template.roleSlug}>
                  {template.roleLabel}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="toolbar">
          <a
            className="primary link-button"
            href={`/contract-letterhead/${contractRoleSlug}?applicationId=${applicationId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open pre-filled contract
          </a>
          <div className="notice" style={{ flex: 1 }}>
            <strong>Signing is managed through the complete onboarding pack.</strong>
            <div className="muted" style={{ marginTop: 4 }}>
              Contract, job description and handbook are issued together and signed once. Use the onboarding pack below rather than issuing the contract separately.
            </div>
          </div>
        </div>

        <div className="subcard" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>External signed contract</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Use this when the candidate returns the signed contract by email. This records an administrator verification event and
            does not pretend that the portal e-signature was completed.
          </p>
          {externalContractVerification ? (
            <div className="notice">
              <strong>Verified externally</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                Verified by {externalContractVerification.verified_by} on {formatDate(externalContractVerification.verified_at)}.
              </div>
              <div style={{ marginTop: 6 }}>{externalContractVerification.note}</div>
            </div>
          ) : (
            <>
              <Field label="Verification note" full>
                <textarea
                  value={externalContractNote}
                  onChange={(event) => setExternalContractNote(event.target.value)}
                  placeholder="Example: Signed contract received by email on 21 Sep 2026 and checked against the issued healthcare-assistant contract."
                />
              </Field>
              <button className="secondary" onClick={() => void recordExternalContract()} disabled={recordingExternalContract}>
                {recordingExternalContract ? 'Recording...' : 'Record signed contract received by email'}
              </button>
            </>
          )}
        </div>

        {signatures.length > 0 && (
          <div className="activity-list" style={{ marginTop: 16 }}>
            {signatures.map((signature) => (
              <article className="activity-item" key={signature.id}>
                <div className="activity-heading">
                  <strong>{signature.status === 'signed' ? 'Signed' : 'Awaiting signature'}</strong>
                  <span>{signature.status === 'signed' ? formatDate(signature.signed_at) : formatDate(signature.issued_at)}</span>
                </div>
                <p className="muted">
                  Role: {signature.role_slug}
                  {signature.status === 'signed' ? ` - Signed as ${signature.signed_name}` : ' - Link sent to candidate'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="subcard">
        <h2>Handbook e-signature</h2>
        <p className="muted">The employee handbook is part of the complete onboarding pack and is signed once with the contract and job description.</p>
        <div className="notice">
          <strong>Included in onboarding pack</strong>
          <div className="muted" style={{ marginTop: 4 }}>Do not issue a separate handbook signing request.</div>
        </div>
        {handbookSignatures.length > 0 && (
          <div className="activity-list" style={{ marginTop: 16 }}>
            {handbookSignatures.map((signature) => (
              <article className="activity-item" key={signature.id}>
                <div className="activity-heading">
                  <strong>{signature.status === 'signed' ? 'Signed' : 'Awaiting signature'}</strong>
                  <span>{signature.status === 'signed' ? formatDate(signature.signed_at) : formatDate(signature.issued_at)}</span>
                </div>
                <p className="muted">{signature.status === 'signed' ? `Signed as ${signature.signed_name}` : 'Link sent to candidate'}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="subcard">
        <h2>Job description e-signature</h2>
        <p className="muted">The {contractRoleSlug ? contractTemplates.find((t) => t.roleSlug === contractRoleSlug)?.roleLabel : 'role'} job description is part of the complete onboarding pack and is signed once with the contract and handbook.</p>
        <div className="notice">
          <strong>Included in onboarding pack</strong>
          <div className="muted" style={{ marginTop: 4 }}>Do not issue a separate job-description signing request.</div>
        </div>
        {jobDescSignatures.length > 0 && (
          <div className="activity-list" style={{ marginTop: 16 }}>
            {jobDescSignatures.map((signature) => (
              <article className="activity-item" key={signature.id}>
                <div className="activity-heading">
                  <strong>{signature.status === 'signed' ? 'Signed' : 'Awaiting signature'}</strong>
                  <span>{signature.status === 'signed' ? formatDate(signature.signed_at) : formatDate(signature.issued_at)}</span>
                </div>
                <p className="muted">
                  Role: {signature.role_slug}
                  {signature.status === 'signed' ? ` - Signed as ${signature.signed_name}` : ' - Link sent to candidate'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="subcard">
        <h2>Issue onboarding pack</h2>
        <p className="muted">
          Sends the complete pre-employment signing set in one message: employment contract, job description and employee handbook.
          Already-signed documents are retained and are not re-issued. Remaining onboarding materials are review, completion or acknowledgement items.
        </p>
        <button className="primary" onClick={() => void issueOnboardingPack()} disabled={issuingPack}>
          {issuingPack ? 'Sending...' : onboardingPackSent ? 'Resend complete onboarding pack' : 'Send complete onboarding pack'}
        </button>
        {packMessage && <div className="success" style={{ marginTop: 12 }}>{packMessage}</div>}
      </section>

      <AdminInterviewPanel applicationId={applicationId} onStatusChanged={() => void loadApplication()} />

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
        <h2>Written interview</h2>
        {application.interview_responses && Object.keys(application.interview_responses).length > 0 ? (
          <div className="activity-list">
            {FIRST_INTERVIEW_ALL_QUESTIONS.filter((question) => application.interview_responses?.[question.id]).map((question) => {
              const answer = application.interview_responses![question.id];
              const audioUrl = payload.interviewAudioUrls?.[question.id];
              return (
                <article className="activity-item" key={question.id}>
                  <div className="activity-heading">
                    <strong>{question.category}</strong>
                  </div>
                  <p className="muted">{question.text}</p>
                  {audioUrl ? (
                    <audio controls src={audioUrl} style={{ width: '100%' }} />
                  ) : (
                    <p>{answer.text || 'Not answered'}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">No written interview answers recorded.</p>
        )}
      </section>

      <section className="subcard">
        <h2>Second interview (practical)</h2>
        <p className="muted">
          Send this to candidates being seriously considered. Covers tougher, safeguarding-led care scenarios.
        </p>
        <button className="primary" onClick={() => void sendSecondInterview()} disabled={sendingSecondInterview}>
          {sendingSecondInterview ? 'Sending...' : 'Send second interview'}
        </button>
        {secondInterviewMessage && <div className="success" style={{ marginTop: 12 }}>{secondInterviewMessage}</div>}

        {secondInterviews.length > 0 && (
          <div className="activity-list" style={{ marginTop: 16 }}>
            {secondInterviews.map((interview) => (
              <article className="activity-item" key={interview.id}>
                <div className="activity-heading">
                  <strong>{interview.status === 'completed' ? 'Completed' : 'Awaiting response'}</strong>
                  <span>{formatDate(interview.status === 'completed' ? interview.completed_at : interview.sent_at)}</span>
                </div>
                {interview.status === 'completed' && interview.answers && (
                  <div style={{ marginTop: 8 }}>
                    {getSecondInterviewQuestions(application.role_applied).filter((question) => interview.answers?.[question.id]).map((question) => {
                      const answer = interview.answers![question.id];
                      const audioUrl = secondInterviewAudioUrls[interview.id]?.[question.id];
                      return (
                        <div key={question.id} style={{ marginTop: 10 }}>
                          <strong style={{ display: 'block', fontSize: 13 }}>{question.category}</strong>
                          <p className="muted" style={{ margin: '2px 0 6px' }}>{question.text}</p>
                          {audioUrl ? (
                            <audio controls src={audioUrl} style={{ width: '100%' }} />
                          ) : (
                            <p style={{ margin: 0 }}>{typeof answer === 'string' ? answer : ''}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
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
