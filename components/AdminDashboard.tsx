'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { recruitmentCopy, recruitmentRoles, recruitmentStatuses, isInternationalCandidate } from '@/lib/recruitment-config';
import { contractTemplates } from '@/lib/contract-templates';

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
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [activeStatus, setActiveStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [pathwayCounts, setPathwayCounts] = useState({ international: 0, ireland: 0, total: 0 });
  const [inviteLink, setInviteLink] = useState('');
  const [inviteEmailStatus, setInviteEmailStatus] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteForm>(emptyInviteForm);
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState('Support Worker');
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, sent: 0, errors: 0 });
  const [bulkErrorLines, setBulkErrorLines] = useState<string[]>([]);
  const [adminEmail, setAdminEmail] = useState('');

  const PAGE_SIZE = 50;

  const loadApplications = async (options?: { append?: boolean }) => {
    setLoadingApplications(true);
    setDashboardError('');

    const offset = options?.append ? applications.length : 0;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (activeStatus !== 'all') params.set('status', activeStatus);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    const response = await fetch(`/api/admin/applications?${params.toString()}`);

    if (!response.ok) {
      if (response.status === 401) {
        setAuthenticated(false);
        setAdminEmail('');
      }

      if (!options?.append) setApplications([]);
      setDashboardError('Unable to load applications.');
      setLoadingApplications(false);
      return;
    }

    const payload = await response.json();
    setApplications((current) => (options?.append ? [...current, ...(payload.applications || [])] : payload.applications || []));
    setApplicationsTotal(payload.total || 0);
    setLoadingApplications(false);
  };

  const loadStatusCounts = async () => {
    const response = await fetch('/api/admin/applications/counts');
    if (!response.ok) return;
    const payload = await response.json();
    setStatusCounts(payload.statusCounts || {});
    setPathwayCounts({ international: payload.international || 0, ireland: payload.ireland || 0, total: payload.total || 0 });
  };

  const checkSession = async () => {
    const response = await fetch('/api/admin/session');
    const payload = await response.json();

    if (payload.authenticated) {
      setAuthenticated(true);
      setAdminEmail(payload.email || '');
      await Promise.all([loadApplications(), loadStatusCounts()]);
    } else {
      setAuthenticated(false);
      setAdminEmail('');
    }

    setBootstrapping(false);
  };

  useEffect(() => {
    void checkSession();
  }, []);

  // Re-run the search whenever the status tab or search box changes, debounced so typing doesn't
  // fire a request per keystroke.
  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setTimeout(() => {
      void loadApplications();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, searchQuery, authenticated]);

  const metrics = useMemo(
    () => ({
      total: pathwayCounts.total,
      newApplications: statusCounts.Submitted || 0,
      international: pathwayCounts.international,
      ireland: pathwayCounts.ireland,
      interview: statusCounts.Interview || 0,
      selected: statusCounts.Selected || 0,
      documentsAwaiting: statusCounts['Documents Awaiting'] || 0,
      permitProcessing: statusCounts['Permit Processing'] || 0,
    }),
    [statusCounts, pathwayCounts]
  );

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
    setInviteEmailStatus(payload.email?.status || null);
    setInviteForm(emptyInviteForm);
  };

  const BULK_CHUNK_SIZE = 25;

  const runBulkInvite = async () => {
    const lines = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const candidates = lines.map((line) => {
      const [email, name, role] = line.split(',').map((part) => part.trim());
      return { email, name: name || null, role: role || bulkRole, expiryDate: null };
    });

    if (candidates.length === 0) return;

    setBulkRunning(true);
    setBulkErrorLines([]);
    setBulkProgress({ done: 0, total: candidates.length, sent: 0, errors: 0 });

    let done = 0;
    let sent = 0;
    let errors = 0;
    const errorLines: string[] = [];

    for (let i = 0; i < candidates.length; i += BULK_CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + BULK_CHUNK_SIZE);

      const response = await fetch('/api/admin/invites/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates: chunk }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        errors += chunk.length;
        errorLines.push(`Batch failed: ${payload.error || 'Unknown error'}`);
      } else {
        const payload = (await response.json()) as { results: { email: string; status: string; error?: string }[] };
        for (const result of payload.results || []) {
          if (result.status === 'sent') {
            sent += 1;
          } else {
            errors += 1;
            errorLines.push(`${result.email}: ${result.error || 'failed'}`);
          }
        }
      }

      done += chunk.length;
      setBulkProgress({ done, total: candidates.length, sent, errors });
      setBulkErrorLines([...errorLines]);
    }

    setBulkRunning(false);
    setBulkText('');
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
            <a className="primary link-button" href="/admin/documents">
              Edit documents
            </a>
            <a className="secondary link-button" href="/contract-letterhead">
              Contract templates
            </a>
            <button className="secondary" onClick={() => { void loadApplications(); void loadStatusCounts(); }}>
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
                <b>{inviteEmailStatus === 'sent' ? 'Invitation emailed to the candidate' : 'Private link created'}</b>
                {inviteEmailStatus && inviteEmailStatus !== 'sent' && (
                  <p className="muted">Email status: {inviteEmailStatus} - use the link below to send it manually.</p>
                )}
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
            <h2>Bulk invite candidates</h2>
            <p className="muted">
              Paste one candidate per line as <code>email</code>, <code>email,name</code>, or <code>email,name,role</code>.
              Lines without a role use the default role below. Sends automatically in batches of 25 - safe to leave running
              for large lists (10,000 candidates takes roughly 400 batches; keep this tab open until it finishes).
            </p>
            <Field label="Default role (used when a line has no role)">
              <select value={bulkRole} onChange={(event) => setBulkRole(event.target.value)}>
                {recruitmentRoles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </Field>
            <Field label="Candidates" full>
              <textarea
                value={bulkText}
                onChange={(event) => setBulkText(event.target.value)}
                placeholder={'jane@example.com,Jane Doe,Support Worker\njohn@example.com'}
                rows={8}
              />
            </Field>
            <button className="primary" onClick={() => void runBulkInvite()} disabled={bulkRunning || !bulkText.trim()}>
              {bulkRunning ? `Sending... (${bulkProgress.done}/${bulkProgress.total})` : 'Send bulk invites'}
            </button>
            {bulkProgress.total > 0 && (
              <div className={bulkProgress.errors > 0 ? 'notice' : 'success'} style={{ marginTop: 12 }}>
                <b>
                  {bulkProgress.done} of {bulkProgress.total} processed - {bulkProgress.sent} sent, {bulkProgress.errors} failed
                </b>
                {bulkErrorLines.length > 0 && (
                  <ul className="notes-list">
                    {bulkErrorLines.slice(0, 20).map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                    {bulkErrorLines.length > 20 && <li>...and {bulkErrorLines.length - 20} more.</li>}
                  </ul>
                )}
              </div>
            )}
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
              {contractTemplates.map((template) => (
                <a className="secondary link-button" href={`/contract-letterhead/${template.roleSlug}`} key={template.roleSlug}>
                  {template.roleLabel}
                </a>
              ))}
            </div>
          </section>

          <section className="subcard">
            <h2>Job descriptions &amp; handbook</h2>
            <p className="muted">
              Issue these alongside the employment contract from the administration area.
            </p>
            <div className="stack-links">
              <a className="secondary link-button" href="/documents">
                Open documents hub
              </a>
              {contractTemplates.map((template) => (
                <a
                  className="secondary link-button"
                  href={`/documents/job-description/${template.roleSlug}`}
                  key={template.roleSlug}
                >
                  {template.roleLabel} job description
                </a>
              ))}
              <a className="secondary link-button" href="/documents/employee-handbook">
                Employee handbook
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
        <div className="section-heading">
          <h2>Applications</h2>
          <input
            type="search"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>

        <div className="status-tabs">
          <button className={activeStatus === 'all' ? 'primary' : 'secondary'} onClick={() => setActiveStatus('all')}>
            All ({pathwayCounts.total})
          </button>
          {recruitmentStatuses.map((statusValue) => (
            <button
              key={statusValue}
              className={activeStatus === statusValue ? 'primary' : 'secondary'}
              onClick={() => setActiveStatus(statusValue)}
            >
              {statusValue} ({statusCounts[statusValue] || 0})
            </button>
          ))}
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
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
              {!loadingApplications && applications.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No applications match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {loadingApplications && <p className="muted">Loading applications...</p>}
        {!loadingApplications && applications.length < applicationsTotal && (
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => void loadApplications({ append: true })}>
            Load more ({applications.length} of {applicationsTotal})
          </button>
        )}
      </section>

      {dashboardError && <div className="error" style={{ marginTop: 20 }}>{dashboardError}</div>}
    </main>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
