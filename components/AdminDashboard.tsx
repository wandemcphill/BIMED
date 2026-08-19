'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { recruitmentCopy, recruitmentRoles, isInternationalCandidate } from '@/lib/recruitment-config';

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

const emptyInviteForm: InviteForm = {
  name: '',
  email: '',
  role: 'Support Worker',
  expiryDate: '',
};

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
  const [authenticated, setAuthenticated] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboardError, setDashboardError] = useState('');
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm);
  const [adminEmail, setAdminEmail] = useState('');

  const loadApplications = async () => {
    setLoadingApplications(true);
    setDashboardError('');

    const response = await fetch('/api/admin/applications');

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
        setAdminEmail('');
      }

      setApplications([]);
      setDashboardError('Unable to load applications.');
      setLoadingApplications(false);
      return;
    }

    const payload = await response.json();
    setApplications(payload.applications || []);
    setLoadingApplications(false);
  };

  const checkSession = async () => {
    const response = await fetch('/api/admin/session');
    const payload = await response.json();

    if (payload.authenticated) {
      setAuthenticated(true);
      setAdminEmail(payload.email || '');
      await loadApplications();
    } else {
      setAuthenticated(false);
      setAdminEmail('');
    }

    setBootstrapping(false);
  };

  useEffect(() => {
    void checkSession();
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

  const login = async () => {
    setLoginError('');

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setLoginError(payload.error || 'Incorrect admin credentials.');
      return;
    }

    setAdminEmail(payload.email || loginEmail);
    setLoginEmail('');
    setLoginPassword('');
    setAuthenticated(true);
    await loadApplications();
  };

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' });
    setAuthenticated(false);
    setApplications([]);
    setInviteLink('');
    setAdminEmail('');
    setLoginEmail('');
    setLoginPassword('');
    setLoginError('');
    setDashboardError('');
  };

  const createInvite = async () => {
    const response = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(inviteForm),
    });

    const payload = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
        setAdminEmail('');
      }

      setDashboardError(payload.error || 'Unable to create invitation.');
      return;
    }

    setInviteLink(payload.link);
    setInviteForm(emptyInviteForm);
  };

  if (bootstrapping) {
    return (
      <main className="wrap">
        <section className="card auth-card">
          <h1>Recruitment Admin</h1>
          <p className="muted">Checking your admin session...</p>
        </section>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="wrap">
        <section className="card auth-card">
          <h1>Recruitment Admin</h1>
          <p className="muted">Sign in with your admin account to open the private recruitment dashboard.</p>
          <Field label="Admin email">
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void login();
                }
              }}
            />
          </Field>
          <Field label="Admin password">
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void login();
                }
              }}
            />
          </Field>
          <button className="primary" onClick={() => void login()}>
            Sign in
          </button>
          {loginError && <div className="error">{loginError}</div>}
          <p className="muted" style={{ marginTop: 16 }}>
            <a href="/admin/forgot-password">Forgot your password?</a>
          </p>
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
            {adminEmail && <p className="muted">Signed in as {adminEmail}</p>}
          </div>
          <div className="toolbar">
            <button className="secondary" onClick={() => void loadApplications()}>
              Refresh
            </button>
            <button className="secondary" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
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
              <li>Status labels remain configurable and can be refined once Bimed confirms the final workflow.</li>
            </ul>
          </section>
        </div>

        <div className="split-grid" style={{ marginTop: 18 }}>
          <section className="subcard">
            <h2>Contract templates</h2>
            <p className="muted">
              Open the printable role-specific contract shells from the administration area.
            </p>
            <div className="stack-links">
              <a className="secondary link-button" href="/contract-letterhead">
                Open contract hub
              </a>
              <a className="secondary link-button" href="/contract-letterhead/support-worker">
                Support worker
              </a>
              <a className="secondary link-button" href="/contract-letterhead/healthcare-assistant">
                Healthcare assistant
              </a>
              <a className="secondary link-button" href="/contract-letterhead/senior-support-worker">
                Senior support worker
              </a>
            </div>
          </section>

          <section className="subcard">
            <h2>Document handling</h2>
            <ul className="notes-list">
              <li>Use the printable templates only after Bimed approves the final legal wording.</li>
              <li>Keep the contract text editable until the final role terms are confirmed.</li>
              <li>Save each document as PDF before issuing it to a candidate.</li>
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
        {loadingApplications && <p className="muted">Loading applications...</p>}
      </section>

      {dashboardError && <div className="error" style={{ marginTop: 20 }}>{dashboardError}</div>}
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
