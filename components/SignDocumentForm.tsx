'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignDocumentForm({
  urlDocType,
  token,
  documentLabel,
}: {
  urlDocType: 'handbook' | 'job-description';
  token: string;
  documentLabel: string;
}) {
  const router = useRouter();
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!typedName.trim()) {
      setError('Type your full legal name to sign.');
      return;
    }
    if (!agreed) {
      setError(`Confirm that you have read and received the ${documentLabel} before signing.`);
      return;
    }

    setSubmitting(true);
    setError('');

    const response = await fetch(`/api/sign-document/${urlDocType}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signed_name: typedName.trim() }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || 'Unable to sign this document right now.');
      setSubmitting(false);
      return;
    }

    router.refresh();
  };

  return (
    <div className="sign-contract-panel">
      <p className="muted">
        Type your full legal name below to sign. This records your electronic signature and today&apos;s date against this
        document.
      </p>
      <div className="field">
        <label>Type your full legal name to sign</label>
        <input value={typedName} onChange={(event) => setTypedName(event.target.value)} placeholder="Full legal name" />
      </div>
      <label className="check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I confirm I have received and read this {documentLabel}.</span>
      </label>
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      <button className="primary" style={{ marginTop: 12 }} onClick={() => void submit()} disabled={submitting}>
        {submitting ? 'Signing...' : 'Sign document'}
      </button>
    </div>
  );
}
