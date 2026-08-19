'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Enter the admin email address for your account.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to request a reset right now.');
        return;
      }

      // Deliberately the same message for known and unknown addresses.
      setMessage(payload.message || 'If that email address belongs to a Bimed admin account, a reset link is on its way.');
      setEmail('');
    } catch {
      setError('Unable to request a reset right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="wrap">
      <section className="card auth-card">
        <span className="pill">ADMIN ACCOUNT</span>
        <h1>Reset your password</h1>
        <p className="muted">
          Enter the email address for your Bimed recruitment portal admin account. We will email you a single-use link to choose a new
          password.
        </p>

        <Field label="Admin email">
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submit();
              }
            }}
          />
        </Field>

        <button className="primary" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Sending...' : 'Email me a reset link'}
        </button>

        {message && (
          <div className="success" style={{ marginTop: 12 }}>
            {message}
          </div>
        )}
        {error && <div className="error">{error}</div>}

        <p className="muted" style={{ marginTop: 16 }}>
          <a href="/admin">Back to sign in</a>
        </p>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
