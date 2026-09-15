'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/staff', label: 'Dashboard' },
  { href: '/staff/messages', label: 'Messages' },
  { href: '/staff/rota', label: 'Rota' },
  { href: '/staff/attendance', label: 'Attendance' },
  { href: '/staff/travel', label: 'Travel to Ireland' },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/staff/login' || pathname.startsWith('/staff/activate') || pathname.startsWith('/staff/forgot-password');

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="bimed-staff-shell">
      <style>{`
        :root { --bimed-sidebar-width: 238px; }
        html, body { max-width:100%; overflow-x:hidden; margin:0; }
        .bimed-staff-shell { min-height:100vh; background:#f4f7fb; }
        .bimed-staff-sidebar {
          position:fixed; inset:0 auto 0 0; width:var(--bimed-sidebar-width); z-index:100;
          display:flex; flex-direction:column; gap:6px; padding:20px 14px;
          box-sizing:border-box; background:#163247; color:#fff; box-shadow:12px 0 30px rgba(15,23,42,.08);
        }
        .bimed-staff-brand { display:block; padding:4px 12px 18px; border-bottom:1px solid rgba(255,255,255,.12); margin-bottom:8px; }
        .bimed-staff-brand strong { display:block; font-size:18px; letter-spacing:-.02em; }
        .bimed-staff-brand span { display:block; margin-top:3px; color:rgba(255,255,255,.62); font-size:11px; letter-spacing:.08em; text-transform:uppercase; }
        .bimed-staff-nav-link {
          display:flex; align-items:center; min-height:46px; padding:0 12px; border-radius:10px;
          color:#fff; text-decoration:none; font-weight:700; font-size:14px; box-sizing:border-box;
        }
        .bimed-staff-nav-link:hover { background:rgba(255,255,255,.08); }
        .bimed-staff-nav-link.active { background:#0f766e; box-shadow:0 6px 18px rgba(15,118,110,.22); }
        .bimed-staff-content { min-width:0; margin-left:var(--bimed-sidebar-width); min-height:100vh; }
        .bimed-staff-mobile-bar { display:none; }
        main { max-width:100vw; box-sizing:border-box; overflow-x:hidden; }
        main img { max-width:100%; height:auto; }

        @media (max-width: 900px) {
          :root { --bimed-sidebar-width:0px; }
          .bimed-staff-sidebar { width:270px; transform:translateX(-104%); transition:transform .2s ease; box-shadow:16px 0 36px rgba(15,23,42,.2); }
          .bimed-staff-sidebar.open { transform:translateX(0); }
          .bimed-staff-overlay { display:none; position:fixed; inset:0; z-index:90; background:rgba(15,23,42,.45); }
          .bimed-staff-overlay.open { display:block; }
          .bimed-staff-content { margin-left:0; padding-top:58px; }
          .bimed-staff-mobile-bar {
            position:fixed; inset:0 0 auto 0; height:58px; z-index:80; display:flex; align-items:center; gap:10px;
            padding:0 12px; box-sizing:border-box; background:#163247; color:#fff; box-shadow:0 4px 16px rgba(15,23,42,.12);
          }
          .bimed-staff-menu-button { width:40px; height:40px; border:1px solid rgba(255,255,255,.18); border-radius:9px; background:transparent; color:#fff; font-size:22px; line-height:1; }
          .bimed-staff-mobile-bar strong { font-size:15px; }
          .bimed-staff-mobile-sub { margin-left:auto; color:rgba(255,255,255,.7); font-size:11px; }

          main > div { max-width:100% !important; box-sizing:border-box; padding-left:16px !important; padding-right:16px !important; }
          main > div > section, main > div > form { min-width:0 !important; max-width:100% !important; box-sizing:border-box; }
          main [style*="grid-template-columns"] { grid-template-columns:minmax(0,1fr) !important; }
          main [style*="display: flex"] { min-width:0 !important; flex-wrap:wrap !important; }
          main [style*="display: grid"] { min-width:0 !important; }
          main [style*="width: 320px"], main [style*="width: 300px"], main [style*="width: 280px"] { width:100% !important; }
          main [style*="minmax(280px"] { min-width:0 !important; }
          main table { width:100% !important; }
          main h1 { font-size:clamp(28px,8vw,42px) !important; line-height:1.08; overflow-wrap:anywhere; }
          main h2 { font-size:clamp(22px,6vw,32px); line-height:1.15; overflow-wrap:anywhere; }
          main h3 { overflow-wrap:anywhere; }
          main p, main li, main label, main strong, main span { overflow-wrap:anywhere; }
          main button, main input, main select, main textarea { max-width:100%; box-sizing:border-box; }
          main section, main form, main article, main aside { min-width:0; }
        }
      `}</style>

      <aside id="bimed-staff-sidebar" className="bimed-staff-sidebar" aria-label="BIMED Staff Portal navigation">
        <div className="bimed-staff-brand"><strong>BIMED Portal</strong><span>Staff workspace</span></div>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`bimed-staff-nav-link ${pathname === item.href ? 'active' : ''}`} onClick={() => { document.getElementById('bimed-staff-sidebar')?.classList.remove('open'); document.getElementById('bimed-staff-overlay')?.classList.remove('open'); }}>
            {item.label}
          </Link>
        ))}
      </aside>
      <div id="bimed-staff-overlay" className="bimed-staff-overlay" onClick={() => { document.getElementById('bimed-staff-sidebar')?.classList.remove('open'); document.getElementById('bimed-staff-overlay')?.classList.remove('open'); }} />
      <div className="bimed-staff-mobile-bar">
        <button type="button" className="bimed-staff-menu-button" aria-label="Open staff navigation" onClick={() => { document.getElementById('bimed-staff-sidebar')?.classList.add('open'); document.getElementById('bimed-staff-overlay')?.classList.add('open'); }}>☰</button>
        <strong>BIMED Portal</strong>
        <span className="bimed-staff-mobile-sub">Staff workspace</span>
      </div>
      <div className="bimed-staff-content">{children}</div>
    </div>
  );
}
