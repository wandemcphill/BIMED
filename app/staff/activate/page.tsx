'use client';

import { Suspense, useSearchParams, useRouter } from 'next/navigation';
import { useState } from 'react';

function ActivateForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const initialEmail = params.get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setInfo('');
    setErrorCode('');

    if (!token) {
      setError('This activation link is missing its secure token. Request a new activation link.');
      setErrorCode('activation_invalid');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/staff/auth/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Activation failed.');
        setErrorCode(data.code || '');
        return;
      }

      router.replace('/staff');
    } catch {
      setError('Activation failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function requestNewLink() {
    setError('');
    setInfo('');
    setResendSent(false);
    setResendBusy(true);

    try {
      const response = await fetch('/api/staff/auth/activation/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Unable to request a new activation link.');
        setErrorCode(data.code || '');
        return;
      }

      if (data.status === 'not_available') {
        setError('This activation link is no longer available for recovery. Please contact BIMED.');
        setErrorCode('activation_invalid');
        return;
      }

      setResendSent(true);
      setInfo('A new activation link has been sent to the email address used during your BIMED recruitment. Please check your inbox and spam/junk folder, then use the latest link.');
    } catch {
      setError('Unable to request a new activation link. Please try again.');
    } finally {
      setResendBusy(false);
    }
  }

  const canRequestNewLink = ['activation_expired', 'activation_replaced', 'activation_invalid'].includes(errorCode) && !resendSent;
  const alreadyActivated = errorCode === 'already_activated';

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f7fb', padding: 24 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 520, background: '#fff', padding: 32, borderRadius: 20, boxShadow: '0 14px 44px rgba(15,23,42,.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: '#0f766e' }}>BIMED Healthcare</div>
        <h1 style={{ fontSize: 29, color: '#102a43', margin: '10px 0 8px' }}>Activate your staff account</h1>
        <p style={{ color: '#627d98', marginBottom: 24 }}>
          Your BIMED ID remains with you throughout your time with BIMED Healthcare.
        </p>

        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>BIMED email</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          readOnly={Boolean(initialEmail)}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '1px solid #d9e2ec',
            borderRadius: 10,
            marginBottom: 8,
            background: initialEmail ? '#f8fafc' : '#fff',
          }}
        />
        <p style={{ color: '#627d98', fontSize: 12, lineHeight: 1.5, margin: '0 0 16px' }}>
          Use the BIMED email shown here. Do not replace it with your personal Gmail, Yahoo, Outlook or other email address.
        </p>

        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Create password</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          minLength={10}
          required
          autoComplete="new-password"
          style={{ width: '100%', padding: '12px 14px', border: '1px solid #d9e2ec', borderRadius: 10, marginBottom: 16 }}
        />

        <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Confirm password</label>
        <input
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          type="password"
          minLength={10}
          required
          autoComplete="new-password"
          style={{ width: '100%', padding: '12px 14px', border: '1px solid #d9e2ec', borderRadius: 10, marginBottom: 16 }}
        />

        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#9b2c2c', padding: 12, borderRadius: 10, marginBottom: 12, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {info && (
          <div style={{ background: '#effcf6', border: '1px solid #b7e4cc', color: '#166534', padding: 12, borderRadius: 10, marginBottom: 12, lineHeight: 1.5 }}>
            {info}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !token || resendBusy || resendSent}
          style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, background: '#0f766e', color: '#fff', fontWeight: 800 }}
        >
          {busy ? 'Activating…' : 'Activate BIMED account'}
        </button>

        {canRequestNewLink && (
          <button
            type="button"
            onClick={() => void requestNewLink()}
            disabled={resendBusy}
            style={{ width: '100%', padding: '12px 16px', border: '1px solid #0f766e', borderRadius: 10, background: '#fff', color: '#0f766e', fontWeight: 800, marginTop: 10 }}
          >
            {resendBusy ? 'Sending new activation link…' : 'Request a new activation link'}
          </button>
        )}

        {alreadyActivated && (
          <a
            href="/staff/login"
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'center', padding: '12px 16px', border: '1px solid #d9e2ec', borderRadius: 10, background: '#fff', color: '#334e68', fontWeight: 800, marginTop: 10, textDecoration: 'none' }}
          >
            Sign in to Staff Portal
          </a>
        )}

        <p style={{ color: '#829ab1', fontSize: 12, lineHeight: 1.5, marginTop: 20 }}>
          Activation links are single-use and expire after 7 days for security. If yours is stale, use the request-new-link option above.
        </p>
      </form>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Loading…</main>}>
      <ActivateForm />
    </Suspense>
  );
}
