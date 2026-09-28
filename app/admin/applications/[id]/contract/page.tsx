'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Signature = {
  id: string;
  role_slug: string;
  status: 'issued' | 'signed' | 'revoked';
  signed_name: string | null;
  signed_at: string | null;
  issued_at: string;
  expires_at: string | null;
};

type Application = {
  id: string;
  full_name: string;
  email: string;
  role_applied: string | null;
};

export default function AdminContractManagerPage() {
  const { id } = useParams<{ id: string }>();
  const [application, setApplication] = useState<Application | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copyUrl, setCopyUrl] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [applicationResponse, signatureResponse] = await Promise.all([
        fetch('/api/admin/applications/' + id),
        fetch('/api/admin/applications/' + id + '/contract-signature'),
      ]);
      if (applicationResponse.status === 401 || signatureResponse.status === 401) {
        throw new Error('Admin session required.');
      }
      const applicationPayload = await applicationResponse.json();
      const signaturePayload = await signatureResponse.json();
      if (!applicationResponse.ok) throw new Error(applicationPayload.error || 'Unable to load candidate.');
      if (!signatureResponse.ok) throw new Error(signaturePayload.error || 'Unable to load contract status.');
      setApplication(applicationPayload.application);
      setSignatures(signaturePayload.signatures || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load contract manager.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  const latestIssued = signatures.find((s) => s.status === 'issued');
  const latestSigned = signatures.find((s) => s.status === 'signed');

  async function sendCopy(mode: 'signed' | 'unsigned') {
    setBusy('send-' + mode);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/applications/' + id + '/contract-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, action: 'send' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to prepare the contract copy.');
      setCopyUrl(payload.url || '');
      if (payload.email?.status === 'sent') {
        setMessage((mode === 'signed' ? 'Signed' : 'Unsigned') + ' contract copy sent to ' + (application?.email || 'the candidate') + '.');
      } else {
        setMessage('Contract copy link generated, but email was not confirmed as sent: ' + (payload.email?.reason || payload.email?.status || 'unknown result') + '.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send contract copy.');
    } finally {
      setBusy('');
    }
  }

  async function createCopy(mode: 'signed' | 'unsigned') {
    setBusy('create-' + mode);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/applications/' + id + '/contract-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, action: 'generate' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to generate contract copy.');
      setCopyUrl(payload.url || '');
      setMessage((mode === 'signed' ? 'Signed' : 'Unsigned') + ' contract copy generated.');
      if (payload.url) window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to generate contract copy.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <main className="wrap"><section className="card"><h1>Contract manager</h1><p className="muted">Loading candidate contract record...</p></section></main>;
  if (!application) return <main className="wrap"><section className="card"><h1>Contract manager</h1><p className="error">{error || 'Candidate not found.'}</p></section></main>;

  return (
    <main className="wrap">
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="pill">CONTRACT MANAGER</span>
            <h1>{application.full_name}</h1>
            <p className="muted">{application.role_applied || 'Role not set'} · {application.email}</p>
          </div>
          <div className="toolbar">
            <a className="secondary link-button" href={'/admin/applications/' + id}>Back to candidate</a>
          </div>
        </div>

        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        {message && <div className="success" style={{ marginTop: 12 }}>{message}</div>}

        <section className="subcard" style={{ marginTop: 18 }}>
          <h2>Generate, download and send contract</h2>
          <p className="muted">
            Admin can work with either the unsigned contract copy or the signed contract copy. Opening a copy provides the print/save-as-PDF control. Sending a copy creates a secure 30-day document link and emails it to the candidate.
          </p>

          <div className="grid">
            <div>
              <h3>Unsigned contract</h3>
              <p className="muted">Use this for a clean contract copy awaiting the employee signature.</p>
              <div className="toolbar">
                <button className="primary" onClick={() => void createCopy('unsigned')} disabled={!!busy}>Generate / open unsigned</button>
                <button className="secondary" onClick={() => void sendCopy('unsigned')} disabled={!!busy}>Send unsigned by email</button>
              </div>
            </div>

            <div>
              <h3>Signed contract</h3>
              <p className="muted">{latestSigned ? 'A signed contract is available.' : 'No signed contract is currently recorded.'}</p>
              <div className="toolbar">
                <button className="primary" onClick={() => void createCopy('signed')} disabled={!!busy || !latestSigned}>Generate / open signed</button>
                <button className="secondary" onClick={() => void sendCopy('signed')} disabled={!!busy || !latestSigned}>Send signed by email</button>
              </div>
            </div>
          </div>

          {copyUrl && (
            <div className="notice" style={{ marginTop: 16 }}>
              <strong>Secure contract copy link generated</strong>
              <div style={{ marginTop: 8, wordBreak: 'break-all' }}>{copyUrl}</div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(copyUrl)}>Copy link</button>
                <a className="secondary link-button" href={copyUrl} target="_blank" rel="noreferrer">Open copy</a>
              </div>
            </div>
          )}
        </section>

        <section className="subcard">
          <h2>Current signing status</h2>
          <div className="activity-list">
            {signatures.length === 0 ? (
              <p className="muted">No contract signing record exists yet. The unsigned contract can still be generated from the candidate record.</p>
            ) : signatures.map((signature) => (
              <article className="activity-item" key={signature.id}>
                <div className="activity-heading">
                  <strong>{signature.status === 'signed' ? 'SIGNED' : signature.status === 'issued' ? 'AWAITING SIGNATURE' : 'SUPERSEDED'}</strong>
                  <span>{new Date(signature.status === 'signed' ? (signature.signed_at || signature.issued_at) : signature.issued_at).toLocaleString('en-IE')}</span>
                </div>
                <p className="muted">
                  {signature.role_slug}
                  {signature.signed_name ? ' · Signed as ' + signature.signed_name : ''}
                  {signature.expires_at ? ' · Link expires ' + new Date(signature.expires_at).toLocaleDateString('en-IE') : ''}
                </p>
              </article>
            ))}
          </div>
          {latestIssued && (
            <div className="notice" style={{ marginTop: 14 }}>
              <strong>Candidate signing link is active.</strong>
              <div className="muted" style={{ marginTop: 4 }}>Use the existing onboarding-pack/signing workflow when you want the candidate to electronically sign. This contract-copy manager is for document generation, download/printing and manual email delivery.</div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
