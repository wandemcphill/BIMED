'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignContractForm({
  token,
  employeeName,
  employeeAddress,
  startDate,
}: {
  token: string;
  employeeName: string;
  employeeAddress: string;
  startDate: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(employeeName);
  const [address, setAddress] = useState(employeeAddress);
  const [date] = useState(startDate);
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) {
      setError('Your full legal name cannot be blank.');
      return;
    }
    if (!typedName.trim()) {
      setError('Type your full legal name to sign.');
      return;
    }
    if (!agreed) {
      setError('Confirm that you have read and accept the contract before signing.');
      return;
    }

    setSubmitting(true);
    setError('');

    const response = await fetch(`/api/sign-contract/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signed_name: typedName.trim(),
        employee_name: name.trim(),
        employee_address: address.trim(),
        start_date: date,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || 'Unable to sign the contract right now.');
      setSubmitting(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="sign-contract-panel">
      <p className="muted">
        Check your details below and correct anything that is wrong before you sign - Bimed will not need to reissue the
        contract for a typo.
      </p>
      <div className="field">
        <label>Your full legal name</label>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Your address</label>
        <input value={address} onChange={(event) => setAddress(event.target.value)} />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Contract start date</label>
        <input type="date" value={date} readOnly aria-readonly="true" />
        <small className="muted">BIMED's standard contractual commencement date. Candidate availability and relocation dates are recorded separately.</small>
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Type your full legal name below to sign. This records your electronic signature and today&apos;s date against this
        contract.
      </p>
      <div className="field">
        <label>Type your full legal name to sign</label>
        <input value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder="Full legal name" />
      </div>
      <label className="check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I have read and understood this contract of employment and accept its terms.</span>
      </label>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      <button className="primary" style={{ marginTop: 12 }} onClick={() => void submit()} disabled={submitting}>
        {submitting ? 'Signing...' : 'Sign contract'}
      </button>
    </div>
  );
}
