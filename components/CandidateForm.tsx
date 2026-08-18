'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
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
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormValues>(() => initialForm(invite));

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const international = useMemo(() => isInternationalCandidate(form), [form]);
  const destinationEmail = supportingDocumentsEmail(form);
  const progress = ((step + 1) / candidateStepTitles.length) * 100;

  const toggleDocument = (documentName: string) => {
    setField(
      'supporting_documents',
      form.supporting_documents.includes(documentName)
        ? form.supporting_documents.filter((value) => value !== documentName)
        : [...form.supporting_documents, documentName]
    );
  };

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
      <section className="card">
        <div className="success">
          <h1>Application submitted</h1>
          <p>Thank you for completing the next stage of your Bimed Healthcare application.</p>
          <p>
            <b>Please send your supporting documents separately to {destinationEmail}.</b>
          </p>
          <p className="muted">Please use your full name in the email subject so the team can match your documents quickly.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <span className="pill">BIMED HEALTHCARE RECRUITMENT</span>
      <h1>Candidate Application</h1>
      <p className="muted">Complete this private application carefully. There are no document uploads.</p>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${progress}%` }} />
      </div>
      <p className="muted">
        Step {step + 1} of {candidateStepTitles.length}: {candidateStepTitles[step]}
      </p>

      {step === 0 && (
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
      )}

      {step === 1 && (
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
      )}

      {step === 2 && (
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
      )}

      {step === 3 && (
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
      )}

      {step === 4 && (
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
                <b>International applicants:</b> {recruitmentCopy.internationalGuidance}
              </div>
            </>
          )}

          {form.living_in_ireland === 'Yes' && (
            <div className="notice full">
              <b>Ireland-based pathway:</b> the application will continue using the Ireland-based recruitment route and document email address.
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <>
          <h2>Supporting documents</h2>
          <p className="muted">Tick what you have. Do not upload documents here. Send them separately after submission.</p>
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
        </>
      )}

      {step === 6 && (
        <>
          <h2>Declaration and consent</h2>
          <p>
            I confirm that the information provided is accurate to the best of my knowledge. I understand Bimed may verify information
            and references and may require pre-employment checks. I understand that an application is not an offer of employment and
            that employment permit and immigration requirements are separate where applicable.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(event) => setField('consent', event.target.checked)}
            />{' '}
            I agree to the declaration and consent to processing of my application information for recruitment purposes.
          </label>
        </>
      )}

      {error && <div className="error">{error}</div>}

      <div className="actions">
        <button className="secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}>
          Back
        </button>
        {step < candidateStepTitles.length - 1 ? (
          <button className="primary" onClick={() => setStep((current) => current + 1)}>
            Continue
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
