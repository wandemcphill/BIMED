'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';

const MIN_LENGTH = 12;

export default function AdminResetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to reset your password.');
        return;
      }

      setDone(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Unable to reset your password right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <main className="wrap">
        <section className="card auth-card">
          <h1>Reset link not valid</h1>
          <p className="muted">This page needs a valid reset link. Request a new one and use the most recent email we sent you.</p>
          <p className="muted">
            <a href="/admin/forgot-password">Request a new reset link</a>
          </p>
        </section>
      </main>
    );
  }

  if (done) {
    return (
      <main className="wrap">
        <section className="card auth-card">
          <span className="pill">ADMIN ACCOUNT</span>
          <h1>Password updated</h1>
          <div className="success">Your password has been updated. You can now sign in with your new password.</div>
          <p className="muted" style={{ marginTop: 16 }}>
            <a href="/admin">Go to sign in</a>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <section className="card auth-card">
        <span className="pill">ADMIN ACCOUNT</span>
        <h1>Choose a new password</h1>
        <p className="muted">
          Pick a password of at least {MIN_LENGTH} characters, including a letter and a number. This link can only be used once.
        </p>

        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submit();
              }
            }}
          />
        </Field>

        <button className="primary" disabled={submitting} onClick={() => void submit()}>
          {submitting ? 'Saving...' : 'Save new password'}
        </button>

        {error && <div className="error">{error}</div>}

        <p className="muted" style={{ marginTop: 16 }}>
          <a href="/admin/forgot-password">Request a new reset link</a>
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
