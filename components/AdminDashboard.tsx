'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  recruitmentCopy,
  recruitmentRoles,
  isInternationalCandidate,
} from '@/lib/recruitment-config';

type ApplicationSummary = {
  id: string;
  full_name: string;
  email: string;
  role_applied: string | null;
  country_of_residence: string | null;
  living_in_ireland: string | null;
  status: string;
  submitted_at: string;
};

type InviteForm = {
  name: string;
  email: string;
  role: string;
  expiryDate: string;
};

const storageKey = 'bimed-admin-password';

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Card({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    name: '',
    email: '',
    role: 'Support Worker',
    expiryDate: '',
  });

  const loadApplications = async (overridePassword?: string) => {
    const adminPassword = overridePassword || password;

    if (!adminPassword) {
      setMessage('Enter the admin password to open the dashboard.');
      return;
    }

    setLoading(true);
    setMessage('');

    const response = await fetch('/api/admin/applications', {
      headers: {
        'x-admin-password': adminPassword,
      },
    });

    if (!response.ok) {
      setAuthenticated(false);
      setApplications([]);
      setMessage('Incorrect admin password.');
      localStorage.removeItem(storageKey);
      setLoading(false);
      return;
    }

    const payload = await response.json();
    setApplications(payload.applications || []);
    setAuthenticated(true);
    localStorage.setItem(storageKey, adminPassword);
    setLoading(false);
  };

  useEffect(() => {
    const storedPassword = localStorage.getItem(storageKey);
    if (storedPassword) {
      setPassword(storedPassword);
      void loadApplications(storedPassword);
    }
  }, []);

  const metrics = useMemo(() => {
    const total = applications.length;
    const interview = 'Interview';
    const selected = 'Selected';
    const documentsAwaiting = 'Documents Awaiting';
    const permitProcessing = 'Permit Processing';

    return {
      total,
      newApplications: applications.filter((application) => application.status === 'Submitted').length,
      international: applications.filter((application) => isInternationalCandidate(application)).length,
      ireland: applications.filter((application) => !isInternationalCandidate(application)).length,
      interview: applications.filter((application) => application.status === interview).length,
      selected: applications.filter((application) => application.status === selected).length,
      documentsAwaiting: applications.filter((application) => application.status === documentsAwaiting).length,
      permitProcessing: applications.filter((application) => application.status === permitProcessing).length,
    };
  }, [applications]);

  const createInvite = async () => {
    const response = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password,
      },
      body: JSON.stringify(inviteForm),
    });

    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.error || 'Unable to create invitation.');
      return;
    }

    setInviteLink(payload.link);
  };

  if (!authenticated) {
    return (
      <main className="wrap">
        <section className="card auth-card">
          <h1>Recruitment Admin</h1>
          <p className="muted">Open the private recruitment dashboard with the current admin password.</p>
          <Field label="Admin password">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void loadApplications();
                }
              }}
            />
          </Field>
          <button className="primary" onClick={() => void loadApplications()}>
            Open dashboard
          </button>
          {loading && <p className="muted">Loading dashboard...</p>}
          {message && <div className="error">{message}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <section className="card">
        <div className="section-heading">
          <div>
            <span className="pill">ADMIN DASHBOARD</span>
            <h1>Recruitment Dashboard</h1>
            <p className="muted">{recruitmentCopy.invitationOnly}</p>
          </div>
          <button className="secondary" onClick={() => void loadApplications()}>
            Refresh
          </button>
        </div>

        <div className="metrics-grid">
          <Card label="Total Applications" value={metrics.total} />
          <Card label="New Applications" value={metrics.newApplications} />
          <Card label="International" value={metrics.international} />
          <Card label="Ireland-based" value={metrics.ireland} />
          <Card label="Interview" value={metrics.interview} />
          <Card label="Selected" value={metrics.selected} />
          <Card label="Documents Awaiting" value={metrics.documentsAwaiting} />
          <Card label="Permit Processing" value={metrics.permitProcessing} />
        </div>

        <div className="split-grid">
          <section className="subcard">
            <h2>Create private invitation</h2>
            <div className="grid">
              <Field label="Candidate name">
                <input
                  value={inviteForm.name}
                  onChange={(event) => setInviteForm({ ...inviteForm, name: event.target.value })}
                />
              </Field>
              <Field label="Candidate email">
                <input
                  value={inviteForm.email}
                  onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })}
                />
              </Field>
              <Field label="Role">
                <select
                  value={inviteForm.role}
                  onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}
                >
                  {recruitmentRoles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </Field>
              <Field label="Optional expiry date">
                <input
                  type="date"
                  value={inviteForm.expiryDate}
                  onChange={(event) => setInviteForm({ ...inviteForm, expiryDate: event.target.value })}
                />
              </Field>
            </div>
            <button className="primary" onClick={() => void createInvite()}>
              Create private link
            </button>
            {inviteLink && (
              <div className="success">
                <b>Private link</b>
                <p className="breakword">{inviteLink}</p>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                  Copy link
                </button>
              </div>
            )}
          </section>

          <section className="subcard">
            <h2>Notes</h2>
            <ul className="notes-list">
              <li>{recruitmentCopy.supportingDocuments}</li>
              <li>Candidate detail records are available from each row in the table below.</li>
              <li>Status labels are configurable and can be refined once Bimed confirms the final workflow.</li>
            </ul>
          </section>
        </div>
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <h2>Applications</h2>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Country</th>
                <th>Pathway</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id}>
                  <td>
                    {application.full_name}
                    <br />
                    <span className="muted">{application.email}</span>
                  </td>
                  <td>{application.role_applied}</td>
                  <td>{application.country_of_residence || 'Not set'}</td>
                  <td>{isInternationalCandidate(application) ? 'International' : 'Ireland-based'}</td>
                  <td>{application.status}</td>
                  <td>{formatDate(application.submitted_at)}</td>
                  <td>
                    <a className="link-button" href={`/admin/applications/${application.id}`}>
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {message && <div className="error" style={{ marginTop: 20 }}>{message}</div>}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
