'use client';

import { useEffect, useState } from 'react';

type SectionForm = {
  heading: string;
  paragraphs: string;
  bullets: string;
};

type EditableContent = {
  documentTitle: string;
  intro: string;
  templateNotes: string;
  sections: SectionForm[];
  schedules: SectionForm[];
  closingNote: string;
};

type DocCatalogEntry = { docType: 'contract' | 'job_description' | 'handbook'; roleSlug: string; label: string };

type RawSection = { heading: string; paragraphs: string[]; bullets?: string[] };
type RawContent = {
  documentTitle?: string;
  intro?: string;
  templateNotes?: string[];
  sections?: RawSection[];
  schedules?: RawSection[];
  closingNote?: string;
};

function toForm(raw: RawContent | null | undefined): EditableContent {
  const toSectionForm = (s: RawSection): SectionForm => ({
    heading: s.heading,
    paragraphs: s.paragraphs.join('\n'),
    bullets: (s.bullets || []).join('\n'),
  });

  return {
    documentTitle: raw?.documentTitle || '',
    intro: raw?.intro || '',
    templateNotes: (raw?.templateNotes || []).join('\n'),
    sections: (raw?.sections || []).map(toSectionForm),
    schedules: (raw?.schedules || []).map(toSectionForm),
    closingNote: raw?.closingNote || '',
  };
}

function toRaw(form: EditableContent): RawContent {
  const toRawSection = (s: SectionForm): RawSection => ({
    heading: s.heading,
    paragraphs: s.paragraphs.split('\n').map((line) => line.trim()).filter(Boolean),
    bullets: s.bullets.trim() ? s.bullets.split('\n').map((line) => line.trim()).filter(Boolean) : undefined,
  });

  return {
    documentTitle: form.documentTitle,
    intro: form.intro,
    templateNotes: form.templateNotes.split('\n').map((line) => line.trim()).filter(Boolean),
    sections: form.sections.map(toRawSection),
    ...(form.schedules.length ? { schedules: form.schedules.map(toRawSection) } : {}),
    closingNote: form.closingNote || undefined,
  };
}

export default function AdminDocumentEditor() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [catalog, setCatalog] = useState<DocCatalogEntry[]>([]);
  const [selected, setSelected] = useState<DocCatalogEntry | null>(null);
  const [form, setForm] = useState<EditableContent | null>(null);
  const [baseForm, setBaseForm] = useState<EditableContent | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const checkSession = async () => {
    const response = await fetch('/api/admin/session');
    const payload = await response.json();
    if (payload.authenticated) {
      setAuthenticated(true);
      await loadCatalog();
    }
    setBootstrapping(false);
  };

  const loadCatalog = async () => {
    const response = await fetch('/api/admin/document-overrides');
    if (!response.ok) return;
    const payload = await response.json();
    setCatalog(payload.documents || []);
  };

  useEffect(() => {
    void checkSession();
  }, []);

  const login = async () => {
    setLoginError('');
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setLoginError(payload.error || 'Incorrect admin credentials.');
      return;
    }
    setAuthenticated(true);
    await loadCatalog();
  };

  const openDocument = async (entry: DocCatalogEntry) => {
    setSelected(entry);
    setLoadingDoc(true);
    setMessage('');
    const params = new URLSearchParams({ doc_type: entry.docType, role_slug: entry.roleSlug });
    const response = await fetch(`/api/admin/document-overrides?${params.toString()}`);
    setLoadingDoc(false);
    if (!response.ok) {
      setMessage('Unable to load this document.');
      return;
    }
    const payload = await response.json();
    setForm(toForm(payload.effective));
    setBaseForm(toForm(payload.base));
  };

  const updateSection = (list: 'sections' | 'schedules', index: number, patch: Partial<SectionForm>) => {
    setForm((current) => {
      if (!current) return current;
      const next = [...current[list]];
      next[index] = { ...next[index], ...patch };
      return { ...current, [list]: next };
    });
  };

  const save = async () => {
    if (!selected || !form) return;
    setSaving(true);
    setMessage('');
    const response = await fetch('/api/admin/document-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_type: selected.docType, role_slug: selected.roleSlug, content: toRaw(form) }),
    });
    const payload = await response.json();
    setSaving(false);
    setMessage(response.ok ? 'Saved. The published page now reflects this text.' : payload.error || 'Unable to save.');
  };

  const resetToDefault = () => {
    if (baseForm) setForm(baseForm);
    setMessage('Reverted to the default wording below - click Save to publish this.');
  };

  if (bootstrapping) {
    return (
      <section className="card auth-card">
        <h1>Document editor</h1>
        <p className="muted">Checking your admin session...</p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="card auth-card">
        <h1>Document editor</h1>
        <p className="muted">Sign in to edit contract, job description and handbook wording.</p>
        <div className="field">
          <label>Admin email</label>
          <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} />
        </div>
        <div className="field">
          <label>Admin password</label>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button className="primary" onClick={() => void login()}>
          Sign in
        </button>
        {loginError && <div className="error">{loginError}</div>}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="pill">DOCUMENT EDITOR</span>
          <h1>Edit issued documents</h1>
          <p className="muted">
            Changes here apply immediately to the published contract, job description and handbook pages - no code
            deployment needed.
          </p>
        </div>
        <a className="secondary link-button" href="/admin">
          Back to dashboard
        </a>
      </div>

      <div className="split-grid" style={{ marginTop: 18 }}>
        <section className="subcard">
          <h2>Documents</h2>
          <div className="stack-links">
            {catalog.map((entry) => (
              <button
                key={`${entry.docType}:${entry.roleSlug}`}
                className={selected?.docType === entry.docType && selected?.roleSlug === entry.roleSlug ? 'primary' : 'secondary'}
                onClick={() => void openDocument(entry)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </section>

        <section className="subcard">
          {!selected && <p className="muted">Choose a document on the left to edit it.</p>}
          {selected && loadingDoc && <p className="muted">Loading...</p>}
          {selected && !loadingDoc && form && (
            <>
              <h2>{selected.label}</h2>
              {message && <div className="success" style={{ marginBottom: 12 }}>{message}</div>}

              <div className="field">
                <label>Document title</label>
                <input value={form.documentTitle} onChange={(event) => setForm({ ...form, documentTitle: event.target.value })} />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Intro line</label>
                <input value={form.intro} onChange={(event) => setForm({ ...form, intro: event.target.value })} />
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label>Notes (one per line)</label>
                <textarea value={form.templateNotes} onChange={(event) => setForm({ ...form, templateNotes: event.target.value })} />
              </div>

              <h3 style={{ marginTop: 20 }}>Sections</h3>
              {form.sections.map((section, index) => (
                <div className="subcard" key={index} style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>Heading</label>
                    <input value={section.heading} onChange={(event) => updateSection('sections', index, { heading: event.target.value })} />
                  </div>
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>Paragraphs (one per line)</label>
                    <textarea
                      value={section.paragraphs}
                      onChange={(event) => updateSection('sections', index, { paragraphs: event.target.value })}
                      rows={Math.min(12, Math.max(3, section.paragraphs.split('\n').length + 1))}
                    />
                  </div>
                  <div className="field" style={{ marginTop: 8 }}>
                    <label>Bullet points (one per line, optional)</label>
                    <textarea value={section.bullets} onChange={(event) => updateSection('sections', index, { bullets: event.target.value })} />
                  </div>
                </div>
              ))}

              {form.schedules.length > 0 && (
                <>
                  <h3 style={{ marginTop: 20 }}>Schedules</h3>
                  {form.schedules.map((section, index) => (
                    <div className="subcard" key={index} style={{ marginTop: 12 }}>
                      <div className="field">
                        <label>Heading</label>
                        <input value={section.heading} onChange={(event) => updateSection('schedules', index, { heading: event.target.value })} />
                      </div>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>Paragraphs (one per line)</label>
                        <textarea
                          value={section.paragraphs}
                          onChange={(event) => updateSection('schedules', index, { paragraphs: event.target.value })}
                          rows={Math.min(12, Math.max(3, section.paragraphs.split('\n').length + 1))}
                        />
                      </div>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label>Bullet points (one per line, optional)</label>
                        <textarea value={section.bullets} onChange={(event) => updateSection('schedules', index, { bullets: event.target.value })} />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {selected.docType === 'contract' && (
                <div className="field" style={{ marginTop: 16 }}>
                  <label>Closing note</label>
                  <textarea value={form.closingNote} onChange={(event) => setForm({ ...form, closingNote: event.target.value })} />
                </div>
              )}

              <div className="toolbar" style={{ marginTop: 16 }}>
                <button className="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button className="secondary" onClick={resetToDefault} disabled={!baseForm}>
                  Reset to default wording
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
