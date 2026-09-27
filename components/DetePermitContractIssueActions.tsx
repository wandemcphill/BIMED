'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  staffId: string;
  status: 'issued' | 'signed' | 'revoked' | 'expired' | null;
  signedName?: string | null;
  signedAt?: string | null;
  issuedAt?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DetePermitContractIssueActions({
  staffId,
  status,
  signedName,
  signedAt,
  issuedAt,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function issue() {
    const prompt =
      status === 'issued'
        ? 'A permit-stage signing link is already active. Reissuing will revoke the existing unsigned link and email a new link to the candidate. Continue?'
        : 'Issue the populated DETE permit-stage employment contract to this candidate for electronic signature?';
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/admin/staff/' + staffId + '/dete-contract/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to issue the permit-stage contract.');
      setMessage(payload.message || 'Permit-stage contract issued and the signing email was sent.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to issue the permit-stage contract.');
    } finally {
      setBusy(false);
    }
  }

  const signed = status === 'signed';

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span className="pill">DETE PERMIT-STAGE SIGNING</span>
          <h2 style={{ margin: '8px 0 6px' }}>
            {signed ? 'Signed contract retained' : status === 'issued' ? 'Awaiting candidate signature' : 'Ready to issue'}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {signed
              ? 'The candidate signature is recorded against the immutable permit-stage document snapshot.'
              : 'This is a separate contract from the original onboarding contract. Issuing it does not reopen or replace the onboarding signing pack.'}
          </p>
        </div>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 12, color: '#66717a' }}>Status</div>
          <strong>{status || 'Not issued'}</strong>
          {issuedAt ? <div style={{ fontSize: 12, color: '#66717a', marginTop: 4 }}>Issued {formatDate(issuedAt)}</div> : null}
          {signedAt ? <div style={{ fontSize: 12, color: '#66717a', marginTop: 4 }}>Signed {formatDate(signedAt)}</div> : null}
          {signedName ? <div style={{ fontSize: 12, color: '#66717a', marginTop: 4 }}>Signed by {signedName}</div> : null}
        </div>
      </div>
      {message ? <div className="notice" style={{ marginTop: 14 }}>{message}</div> : null}
      {error ? <div className="error" style={{ marginTop: 14 }}>{error}</div> : null}
      {!signed ? (
        <button className="primary" style={{ marginTop: 14 }} onClick={() => void issue()} disabled={busy}>
          {busy ? 'Issuing…' : status === 'issued' ? 'Reissue and email signing link' : 'Issue and email signing link'}
        </button>
      ) : null}
    </section>
  );
}
