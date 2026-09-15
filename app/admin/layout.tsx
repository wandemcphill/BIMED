'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const sections = [
  {
    title: 'Recruitment',
    items: [
      { href: '/admin', label: 'Dashboard' },
    ],
  },
  {
    title: 'Workforce',
    items: [
      { href: '/admin/staff', label: 'Staff' },
      { href: '/admin/messages', label: 'Messages' },
      { href: '/admin/rota', label: 'Rota' },
      { href: '/admin/attendance', label: 'Attendance' },
      { href: '/admin/payslips', label: 'Payslips' },
    ],
  },
  {
    title: 'Overseas',
    items: [
      { href: '/admin/permit', label: 'Permit & Travel' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin/documents', label: 'Documents' },
      { href: '/admin/staff/new', label: 'Create BIMED staff' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    setOpen(false);
    void fetch('/api/admin/session', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.authenticated) setAdminEmail(payload.email || '');
      })
      .catch(() => undefined);
  }, [pathname]);

  const close = () => setOpen(false);

  return (
    <div className="bimed-admin-shell">
      <style>{`
        .bimed-admin-shell { min-height:100vh; background:#f4f7fb; color:#102a43; }
        .bimed-admin-sidebar { position:fixed; inset:0 auto 0 0; width:252px; z-index:100; display:flex; flex-direction:column; box-sizing:border-box; background:#102f44; color:#fff; padding:18px 14px; box-shadow:14px 0 36px rgba(15,23,42,.10); overflow-y:auto; }
        .bimed-admin-brand { padding:5px 12px 18px; border-bottom:1px solid rgba(255,255,255,.12); margin-bottom:12px; }
        .bimed-admin-brand strong { display:block; font-size:18px; letter-spacing:-.02em; }
        .bimed-admin-brand span { display:block; margin-top:3px; color:rgba(255,255,255,.58); font-size:11px; text-transform:uppercase; letter-spacing:.1em; }
        .bimed-admin-section { margin:11px 0 4px; padding:0 12px; color:rgba(255,255,255,.48); font-size:10px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
        .bimed-admin-link { display:flex; align-items:center; min-height:44px; padding:0 12px; border-radius:10px; color:#fff; text-decoration:none; font-size:14px; font-weight:700; transition:background .16s ease, transform .16s ease; }
        .bimed-admin-link:hover { background:rgba(255,255,255,.08); }
        .bimed-admin-link.active { background:#0f766e; box-shadow:0 7px 20px rgba(15,118,110,.24); }
        .bimed-admin-footer { margin-top:auto; padding:14px 12px 4px; border-top:1px solid rgba(255,255,255,.12); color:rgba(255,255,255,.68); font-size:11px; line-height:1.5; }
        .bimed-admin-footer strong { display:block; color:#fff; font-size:12px; margin-bottom:2px; overflow-wrap:anywhere; }
        .bimed-admin-content { min-width:0; margin-left:252px; min-height:100vh; }
        .bimed-admin-mobile-bar { display:none; }
        .bimed-admin-overlay { display:none; }
        .bimed-admin-content main { min-width:0; max-width:100vw; overflow-x:hidden; }

        @media (max-width: 980px) {
          .bimed-admin-sidebar { width:274px; transform:translateX(-104%); transition:transform .2s ease; box-shadow:18px 0 44px rgba(15,23,42,.22); }
          .bimed-admin-sidebar.open { transform:translateX(0); }
          .bimed-admin-content { margin-left:0; padding-top:60px; }
          .bimed-admin-mobile-bar { position:fixed; inset:0 0 auto 0; height:60px; z-index:90; display:flex; align-items:center; gap:10px; padding:0 12px; box-sizing:border-box; background:#102f44; color:#fff; box-shadow:0 4px 18px rgba(15,23,42,.15); }
          .bimed-admin-menu { width:42px; height:42px; border:1px solid rgba(255,255,255,.16); border-radius:10px; background:transparent; color:#fff; font-size:21px; }
          .bimed-admin-mobile-bar strong { font-size:15px; }
          .bimed-admin-mobile-sub { margin-left:auto; color:rgba(255,255,255,.68); font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:45vw; }
          .bimed-admin-overlay.open { display:block; position:fixed; inset:0; z-index:80; background:rgba(15,23,42,.46); }

          .bimed-admin-content .wrap { padding:18px 14px 40px; }
          .bimed-admin-content .card { padding:18px; border-radius:16px; }
          .bimed-admin-content .subcard { padding:16px; }
          .bimed-admin-content .metrics-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .bimed-admin-content .grid,
          .bimed-admin-content .detail-grid,
          .bimed-admin-content .split-grid,
          .bimed-admin-content .template-grid { grid-template-columns:minmax(0,1fr); }
          .bimed-admin-content .section-heading,
          .bimed-admin-content .candidate-hero,
          .bimed-admin-content .invite-banner,
          .bimed-admin-content .gate-hero,
          .bimed-admin-content .contract-header,
          .bimed-admin-content .actions { flex-direction:column; align-items:stretch; }
          .bimed-admin-content .toolbar { display:grid; grid-template-columns:minmax(0,1fr); }
          .bimed-admin-content .toolbar > * { width:100%; }
          .bimed-admin-content .detail-row { grid-template-columns:1fr; gap:4px; }
          .bimed-admin-content .candidate-summary,
          .bimed-admin-content .invite-details,
          .bimed-admin-content .gate-note { min-width:0; width:100%; }
          .bimed-admin-content .checklist { grid-template-columns:minmax(0,1fr); }
          .bimed-admin-content .stepper { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .bimed-admin-content .table-wrap { overflow-x:auto; }
          .bimed-admin-content table { min-width:680px; }
          .bimed-admin-content input,
          .bimed-admin-content select,
          .bimed-admin-content textarea,
          .bimed-admin-content button,
          .bimed-admin-content a { max-width:100%; box-sizing:border-box; }
          .bimed-admin-content h1 { font-size:clamp(28px,7vw,40px); line-height:1.08; overflow-wrap:anywhere; }
          .bimed-admin-content h2 { font-size:clamp(22px,5.5vw,30px); line-height:1.15; overflow-wrap:anywhere; }
          .bimed-admin-content h3,
          .bimed-admin-content p,
          .bimed-admin-content li,
          .bimed-admin-content label,
          .bimed-admin-content strong,
          .bimed-admin-content span { overflow-wrap:anywhere; }
        }

        @media (max-width: 560px) {
          .bimed-admin-content .metrics-grid { grid-template-columns:minmax(0,1fr); }
          .bimed-admin-content .stepper { grid-template-columns:minmax(0,1fr); }
          .bimed-admin-content .card { padding:15px; }
        }
      `}</style>

      <aside className={`bimed-admin-sidebar ${open ? 'open' : ''}`} aria-label="BIMED Admin navigation">
        <div className="bimed-admin-brand"><strong>BIMED Admin</strong><span>Operations workspace</span></div>
        {sections.map((section) => (
          <div key={section.title}>
            <div className="bimed-admin-section">{section.title}</div>
            {section.items.map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return <Link key={item.href} href={item.href} className={`bimed-admin-link ${active ? 'active' : ''}`} onClick={close}>{item.label}</Link>;
            })}
          </div>
        ))}
        <div className="bimed-admin-footer"><strong>{adminEmail || 'Private admin workspace'}</strong>Use the navigation to move between recruitment, workforce, operations and overseas workflows.</div>
      </aside>
      <div className={`bimed-admin-overlay ${open ? 'open' : ''}`} onClick={close} />
      <div className="bimed-admin-mobile-bar">
        <button type="button" className="bimed-admin-menu" aria-label="Open admin navigation" onClick={() => setOpen(true)}>☰</button>
        <strong>BIMED Admin</strong>
        <span className="bimed-admin-mobile-sub">Operations workspace</span>
      </div>
      <div className="bimed-admin-content">{children}</div>
    </div>
  );
}
