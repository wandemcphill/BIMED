'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  candidateStepTitles,
  candidateSupportDocuments,
  recruitmentContacts,
  recruitmentCopy,
  recruitmentRoles,
  supportingDocumentsEmail,
  isInternationalCandidate,
} from '@/lib/recruitment-config';

type Invite = {
  candidate_name?: string | null;
  candidate_email?: string | null;
  role?: string | null;
};

type FormValues = {
  full_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  nationality: string;
  country_of_residence: string;
  address: string;
  role_applied: string;
  employment_type: string;
  availability: string;
  start_date: string;
  driving_licence: string;
  vehicle_access: string;
  care_experience: string;
  qualifications: string;
  training: string;
  professional_experience: string;
  employment_history: string;
  employment_gaps: string;
  references: string;
  living_in_ireland: string;
  current_country: string;
  work_permission: string;
  requires_employment_permit: string;
  international_experience: string;
  relocation_readiness: string;
  supporting_documents: string[];
  consent: boolean;
};

type DraftState = 'saving' | 'saved' | 'restored' | 'error';

const stepGuidance = [
  'Tell us who you are and how we can reach you.',
  'Confirm the role and your basic availability.',
  'Share your care background, qualifications and training.',
  'List your employment history and references clearly.',
  'Confirm whether you are already living in Ireland or will need the international route.',
  'Tick the documents you have and prepare to email them separately.',
  'Review everything before you submit.',
  'Read the declaration carefully and give consent to proceed.',
] as const;

const draftStoragePrefix = 'bimed-candidate-draft';

const initialForm = (invite?: Invite): FormValues => ({
  full_name: invite?.candidate_name ?? '',
  preferred_name: '',
  email: invite?.candidate_email ?? '',
  phone: '',
  date_of_birth: '',
  nationality: '',
  country_of_residence: '',
  address: '',
  role_applied: invite?.role ?? '',
  employment_type: '',
  availability: '',
  start_date: '',
  driving_licence: '',
  vehicle_access: '',
  care_experience: '',
  qualifications: '',
  training: '',
  professional_experience: '',
  employment_history: '',
  employment_gaps: '',
  references: '',
  living_in_ireland: '',
  current_country: '',
  work_permission: '',
  requires_employment_permit: '',
  international_experience: '',
  relocation_readiness: '',
  supporting_documents: [],
  consent: false,
});

export default function CandidateForm({
  token,
  invite,
}: {
  token: string;
  invite?: Invite;
}) {
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormValues>(() => initialForm(invite));
  const [draftState, setDraftState] = useState<DraftState>('saved');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const draftKey = `${draftStoragePrefix}:${token}`;

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let restoreTimer: number | undefined;

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          token?: string;
          step?: number;
          form?: Partial<FormValues>;
          lastSavedAt?: string | null;
        };

        if (parsed.token === token && parsed.form) {
          setForm((current) => ({
            ...current,
            ...parsed.form,
            supporting_documents: Array.isArray(parsed.form?.supporting_documents)
              ? parsed.form.supporting_documents
              : current.supporting_documents,
          }));
          if (typeof parsed.step === 'number') {
            setStep(Math.max(0, Math.min(parsed.step, candidateStepTitles.length - 1)));
          }
          if (parsed.lastSavedAt) {
            setLastSavedAt(parsed.lastSavedAt);
          }
          setDraftState('restored');
        }
      }
    } catch {
      setDraftState('error');
    }

    restoreTimer = window.setTimeout(() => {
      setDraftState((current) => (current === 'restored' ? 'saved' : current));
    }, 0);

    return () => {
      if (restoreTimer) {
        window.clearTimeout(restoreTimer);
      }
    };
  }, [draftKey, token]);

  useEffect(() => {
    if (!furthestStep || step > furthestStep) {
      setFurthestStep(step);
    }
  }, [furthestStep, step]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (done) {
      return;
    }

    setDraftState('saving');
    const timer = window.setTimeout(() => {
      try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            token,
            step,
            form,
            lastSavedAt: savedAt,
          })
        );
        setLastSavedAt(savedAt);
        setDraftState('saved');
      } catch {
        setDraftState('error');
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [draftKey, done, form, step, token]);

  const international = useMemo(() => isInternationalCandidate(form), [form]);
  const destinationEmail = supportingDocumentsEmail(form);
  const progress = ((step + 1) / candidateStepTitles.length) * 100;
  const saveLabel = (() => {
    if (draftState === 'saving') {
      return 'Saving draft...';
    }

    if (draftState === 'error') {
      return 'Autosave unavailable';
    }

    if (draftState === 'restored') {
      return 'Draft restored';
    }

    if (lastSavedAt) {
      return `Saved at ${new Date(lastSavedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return 'Draft saved';
  })();

  const toggleDocument = (documentName: string) => {
    setField(
      'supporting_documents',
      form.supporting_documents.includes(documentName)
        ? form.supporting_documents.filter((value) => value !== documentName)
        : [...form.supporting_documents, documentName]
    );
  };

  const jumpToStep = (nextStep: number) => {
    const clamped = Math.max(0, Math.min(nextStep, candidateStepTitles.length - 1));
    if (clamped <= furthestStep) {
      setStep(clamped);
    }
  };

  const formatValue = (value: string | string[] | boolean | null | undefined) => {
    if (Array.isArray(value)) {
      return value.length ? value.join(', ') : 'Not set';
    }

    if (value === true) {
      return 'Yes';
    }

    if (value === false) {
      return 'No';
    }

    if (value === null || value === undefined || value === '') {
      return 'Not set';
    }

    return value;
  };

  const reviewSection = (title: string, lines: Array<[string, string | string[] | boolean | null | undefined]>, editStep: number) => (
    <section className="review-card">
      <div className="review-header">
        <h3>{title}</h3>
        <button className="secondary review-edit" type="button" onClick={() => setStep(editStep)}>
          Edit
        </button>
      </div>
      <dl className="review-list">
        {lines.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  const validateBeforeSubmit = () => {
    if (!form.full_name || !form.email || !form.role_applied || !form.living_in_ireland || !form.consent) {
      return 'Please complete the required fields and accept the declaration.';
    }

    if (international) {
      if (!form.current_country || !form.work_permission || !form.requires_employment_permit || !form.relocation_readiness) {
        return 'Please complete the international pathway questions before submitting.';
      }
    }

    return '';
  };

  const submit = async () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      setError(validationError);
      return;
    }

    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        ...form,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error || 'Submission failed.');
      return;
    }

    setDone(true);
  };

  if (done) {
    return (
      <section className="card success-card">
        <span className="pill">SUBMITTED</span>
        <h1>Application submitted</h1>
        <p className="muted">
          Thank you. Your application has been received by Bimed Healthcare and the recruitment team can now review it.
        </p>
        <div className="success-steps">
          <article>
            <strong>1. Send supporting documents</strong>
            <p>Email them separately to <b>{destinationEmail}</b> and include your full name in the subject line.</p>
          </article>
          <article>
            <strong>2. Watch your inbox</strong>
            <p>The team will contact you if they need anything else or if they move you to the next stage.</p>
          </article>
          <article>
            <strong>3. Keep your record</strong>
            <p>Save the confirmation email and keep a copy of your documents for your own records.</p>
          </article>
        </div>
        <div className="notice">
          <b>Need help?</b> Contact the Bimed recruitment team at <b>{recruitmentContacts.admin}</b>.
        </div>
      </section>
    );
  }

  return (
    <section className="card candidate-card">
      <div className="candidate-hero">
        <div>
          <span className="pill">BIMED HEALTHCARE RECRUITMENT</span>
          <h1>Candidate Application</h1>
          <p className="muted">
            Complete this private application carefully. There are no document uploads, and your answers are saved as you go.
          </p>
        </div>
        <aside className="candidate-summary">
          <div>
            <span>Invitation</span>
            <strong>{invite?.candidate_name ? `For ${invite.candidate_name}` : 'Private invitation'}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{invite?.role || 'To be confirmed'}</strong>
          </div>
          <div>
            <span>Autosave</span>
            <strong>{saveLabel}</strong>
          </div>
        </aside>
      </div>

      <section className="invite-banner">
        <div>
          <strong>Your invitation is private.</strong>
          <p className="muted">
            This link opens your own application journey. You can move back and forth between steps, and your draft will be saved
            automatically on this device.
          </p>
        </div>
        <div className="invite-details">
          <div>
            <span>Candidate email</span>
            <strong>{invite?.candidate_email || form.email || 'Not set yet'}</strong>
          </div>
          <div>
            <span>Support email</span>
            <strong>{recruitmentContacts.admin}</strong>
          </div>
        </div>
      </section>

      <nav className="stepper" aria-label="Application progress">
        {candidateStepTitles.map((title, index) => {
          const status = index < step ? 'completed' : index === step ? 'current' : index <= furthestStep ? 'available' : 'locked';
          const isClickable = index <= furthestStep;

          return (
            <button
              key={title}
              type="button"
              className={`stepper-item ${status}`}
              onClick={() => jumpToStep(index)}
              disabled={!isClickable}
            >
              <span className="stepper-index">{index < step ? 'Done' : index + 1}</span>
              <span className="stepper-copy">
                <strong>{title}</strong>
                <small>{step === index ? stepGuidance[index] : index < step ? 'Completed' : isClickable ? 'Available' : 'Locked'}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="step-meta">
        <span className="pill">STEP {step + 1} OF {candidateStepTitles.length}</span>
        <h2>{candidateStepTitles[step]}</h2>
        <p className="muted">{stepGuidance[step]}</p>
      </div>

      <div className="progress" aria-hidden="true">
        <div style={{ width: `${progress}%` }} />
      </div>

      {step === 0 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>About you</h2>
            <p className="muted">Use the name and contact details you want Bimed to use when they respond to you.</p>
          </div>
          <div className="grid">
            <Field label="Full legal name *" full>
              <input value={form.full_name} onChange={(event) => setField('full_name', event.target.value)} />
            </Field>
            <Field label="Preferred name">
              <input value={form.preferred_name} onChange={(event) => setField('preferred_name', event.target.value)} />
            </Field>
            <Field label="Email address *">
              <input type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} />
            </Field>
            <Field label="Mobile telephone">
              <input value={form.phone} onChange={(event) => setField('phone', event.target.value)} />
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.date_of_birth} onChange={(event) => setField('date_of_birth', event.target.value)} />
            </Field>
            <Field label="Nationality">
              <input value={form.nationality} onChange={(event) => setField('nationality', event.target.value)} />
            </Field>
            <Field label="Country of residence *">
              <select value={form.country_of_residence} onChange={(event) => setField('country_of_residence', event.target.value)}>
                <option value="">Select</option>
                <option>Ireland</option>
                <option>Nigeria</option>
                <option>Ghana</option>
                <option>Kenya</option>
                <option>South Africa</option>
                <option>United Kingdom</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Current address" full>
              <textarea value={form.address} onChange={(event) => setField('address', event.target.value)} />
            </Field>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Position and availability</h2>
            <p className="muted">This helps Bimed match you to the right role and understand when you can start.</p>
          </div>
          <div className="grid">
            <Field label="Position applied for *">
              <select value={form.role_applied} onChange={(event) => setField('role_applied', event.target.value)}>
                <option value="">Select</option>
                {recruitmentRoles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select value={form.employment_type} onChange={(event) => setField('employment_type', event.target.value)}>
                <option value="">Select</option>
                <option>Full-time</option>
                <option>Part-time</option>
                <option>Flexible</option>
              </select>
            </Field>
            <Field label="Availability">
              <input value={form.availability} onChange={(event) => setField('availability', event.target.value)} />
            </Field>
            <Field label="Preferred start date">
              <input type="date" value={form.start_date} onChange={(event) => setField('start_date', event.target.value)} />
            </Field>
            <Field label="Driving licence">
              <select value={form.driving_licence} onChange={(event) => setField('driving_licence', event.target.value)}>
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not applicable</option>
              </select>
            </Field>
            <Field label="Access to vehicle">
              <select value={form.vehicle_access} onChange={(event) => setField('vehicle_access', event.target.value)}>
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
                <option>Not applicable</option>
              </select>
            </Field>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Experience and qualifications</h2>
            <p className="muted">Keep it clear and practical. Short paragraphs are easier to review than long blocks of text.</p>
          </div>
          <div className="grid">
            <Field label="Care / healthcare experience" full>
              <textarea value={form.care_experience} onChange={(event) => setField('care_experience', event.target.value)} />
            </Field>
            <Field label="Qualifications" full>
              <textarea value={form.qualifications} onChange={(event) => setField('qualifications', event.target.value)} />
            </Field>
            <Field label="Relevant training" full>
              <textarea value={form.training} onChange={(event) => setField('training', event.target.value)} />
            </Field>
            <Field label="Professional experience" full>
              <textarea
                value={form.professional_experience}
                onChange={(event) => setField('professional_experience', event.target.value)}
                placeholder="Summarise the most relevant work experience."
              />
            </Field>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Employment and references</h2>
            <p className="muted">Give enough detail for the recruitment team to understand your recent work history and references.</p>
          </div>
          <div className="grid">
            <Field label="Employment history" full>
              <textarea
                placeholder="Employer, role and dates."
                value={form.employment_history}
                onChange={(event) => setField('employment_history', event.target.value)}
              />
            </Field>
            <Field label="Employment gaps" full>
              <textarea
                placeholder="Dates and brief explanation."
                value={form.employment_gaps}
                onChange={(event) => setField('employment_gaps', event.target.value)}
              />
            </Field>
            <Field label="Professional references" full>
              <textarea
                placeholder="Name, role, organisation, email and telephone where available."
                value={form.references}
                onChange={(event) => setField('references', event.target.value)}
              />
            </Field>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Ireland / international pathway</h2>
            <p className="muted">
              This step helps Bimed route your application correctly and understand whether immigration questions apply.
            </p>
          </div>
          <div className="grid">
            <Field label="Are you currently living in Ireland? *">
              <select value={form.living_in_ireland} onChange={(event) => setField('living_in_ireland', event.target.value)}>
                <option value="">Select</option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </Field>

            {form.living_in_ireland === 'No' && (
              <>
                <Field label="Current country" full>
                  <input value={form.current_country} onChange={(event) => setField('current_country', event.target.value)} />
                </Field>
                <Field label="Do you currently have permission to work in Ireland? *" full>
                  <select value={form.work_permission} onChange={(event) => setField('work_permission', event.target.value)}>
                    <option value="">Select</option>
                    <option>Yes</option>
                    <option>No</option>
                    <option>Not sure</option>
                  </select>
                </Field>
                <Field label="Will you require an employment permit? *" full>
                  <select value={form.requires_employment_permit} onChange={(event) => setField('requires_employment_permit', event.target.value)}>
                    <option value="">Select</option>
                    <option>Yes</option>
                    <option>No</option>
                    <option>Not sure</option>
                  </select>
                </Field>
                <Field label="Previous international work experience" full>
                  <textarea
                    value={form.international_experience}
                    onChange={(event) => setField('international_experience', event.target.value)}
                  />
                </Field>
                <Field label="Relocation readiness *" full>
                  <select value={form.relocation_readiness} onChange={(event) => setField('relocation_readiness', event.target.value)}>
                    <option value="">Select</option>
                    <option>Ready to relocate</option>
                    <option>Need support to relocate</option>
                    <option>Not sure</option>
                  </select>
                </Field>
                <div className="notice full">
                  <b>International applicants:</b> {recruitmentCopy.internationalGuidance} Please send supporting documents to{' '}
                  <b>{recruitmentContacts.overseas}</b>.
                </div>
              </>
            )}

            {form.living_in_ireland === 'Yes' && (
              <div className="notice full">
                <b>Ireland-based pathway:</b> the application will continue using the Ireland-based recruitment route. Please send supporting
                documents to <b>{recruitmentContacts.ireland}</b>.
              </div>
            )}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Supporting documents</h2>
            <p className="muted">
              Tick what you have. Do not upload documents here. Send them separately after submission, using the email address shown below.
            </p>
          </div>
          <div className="checklist">
            {candidateSupportDocuments.map((documentName) => (
              <label className="check" key={documentName}>
                <input
                  type="checkbox"
                  checked={form.supporting_documents.includes(documentName)}
                  onChange={() => toggleDocument(documentName)}
                />{' '}
                {documentName}
              </label>
            ))}
          </div>
          <div className="notice">
            Send documents to <b>{destinationEmail}</b>.
          </div>
        </section>
      )}

      {step === 6 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Review your application</h2>
            <p className="muted">Check each section before you move to the declaration. Use Edit to jump back to a section if anything needs changing.</p>
          </div>
          <div className="review-grid">
            {reviewSection('Personal information', [
              ['Full legal name', form.full_name],
              ['Preferred name', form.preferred_name],
              ['Email address', form.email],
              ['Mobile telephone', form.phone],
              ['Date of birth', form.date_of_birth],
              ['Nationality', form.nationality],
              ['Country of residence', form.country_of_residence],
              ['Address', form.address],
            ], 0)}
            {reviewSection('Role and availability', [
              ['Position applied for', form.role_applied],
              ['Employment type', form.employment_type],
              ['Availability', form.availability],
              ['Preferred start date', form.start_date],
              ['Driving licence', form.driving_licence],
              ['Access to vehicle', form.vehicle_access],
            ], 1)}
            {reviewSection('Experience and qualifications', [
              ['Care / healthcare experience', form.care_experience],
              ['Qualifications', form.qualifications],
              ['Relevant training', form.training],
              ['Professional experience', form.professional_experience],
            ], 2)}
            {reviewSection('Employment and references', [
              ['Employment history', form.employment_history],
              ['Employment gaps', form.employment_gaps],
              ['Professional references', form.references],
            ], 3)}
            {reviewSection('Ireland / international pathway', [
              ['Living in Ireland', form.living_in_ireland],
              ['Current country', form.current_country],
              ['Work permission', form.work_permission],
              ['Employment permit required', form.requires_employment_permit],
              ['International experience', form.international_experience],
              ['Relocation readiness', form.relocation_readiness],
            ], 4)}
            <section className="review-card">
              <div className="review-header">
                <h3>Supporting documents</h3>
                <button className="secondary review-edit" type="button" onClick={() => setStep(5)}>
                  Edit
                </button>
              </div>
              <div className="document-list">
                {candidateSupportDocuments.map((documentName) => (
                  <span
                    className={form.supporting_documents.includes(documentName) ? 'document-tag selected' : 'document-tag'}
                    key={documentName}
                  >
                    {documentName}
                  </span>
                ))}
              </div>
            </section>
          </div>
          <div className="notice">
            <b>Next step:</b> continue to the declaration once everything looks right.
          </div>
        </section>
      )}

      {step === 7 && (
        <section className="subcard candidate-section">
          <div className="section-intro">
            <h2>Declaration and consent</h2>
            <p className="muted">Read this carefully. This is the final step before you submit your application.</p>
          </div>
          <p>{recruitmentCopy.declaration.statement}</p>
          <div className="notice">
            <b>{recruitmentCopy.privacyNotice.heading}</b>
            <p>{recruitmentCopy.privacyNotice.summary}</p>
            <ul style={{ margin: '10px 0 0', paddingLeft: '20px' }}>
              {recruitmentCopy.privacyNotice.details.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p style={{ marginBottom: 0 }}>{recruitmentCopy.privacyNotice.contact}</p>
          </div>
          <label className="check check-large">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(event) => setField('consent', event.target.checked)}
            />{' '}
            {recruitmentCopy.declaration.consent}
          </label>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
          Back
        </button>
        {step < candidateStepTitles.length - 1 ? (
          <button className="primary" onClick={() => setStep((current) => current + 1)}>
            {step === 6 ? 'Continue to declaration' : 'Continue'}
          </button>
        ) : (
          <button className="primary" onClick={submit}>
            Submit application
          </button>
        )}
      </div>
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
