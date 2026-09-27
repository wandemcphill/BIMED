'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignDeteContractForm({
  token,
  employeeName,
}: {
  token: string;
  employeeName: string;
}) {
  const router = useRouter();
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!typedName.trim()) {
      setError('Type your full legal name to sign.');
      return;
    }
    if (!agreed) {
      setError('Confirm that you have read and accept this permit-stage employment contract.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/sign-dete-contract/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_name: typedName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Unable to sign the permit-stage contract right now.');
        return;
      }
      router.refresh();
    } catch {
      setError('Unable to reach the signing service. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sign-contract-panel">
      <p className="muted">
        Review the complete BIMED permit-stage employment contract above before signing. Your legal name shown
        on the contract is fixed from the BIMED Staff Portal record.
      </p>
      <div className="field">
        <label>Employee</label>
        <input value={employeeName} readOnly aria-readonly="true" />
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Type your full legal name to sign</label>
        <input
          value={typedName}
          onChange={(event) => setTypedName(event.target.value)}
          placeholder="Full legal name"
          autoComplete="name"
        />
      </div>
      <label className="check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          I have read and understood this permit-stage employment contract and accept its terms. I understand
          that this signed copy is intended for the Irish employment permit application.
        </span>
      </label>
      {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}
      <button
        className="primary"
        style={{ marginTop: 12 }}
        onClick={() => void submit()}
        disabled={submitting}
      >
        {submitting ? 'Signing…' : 'Sign permit-stage contract'}
      </button>
    </div>
  );
}
