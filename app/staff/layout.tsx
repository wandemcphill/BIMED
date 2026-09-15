import Link from 'next/link';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <>
    <style>{`
      html, body { max-width:100%; overflow-x:hidden; }
      .bimed-staff-nav { position:sticky; top:0; z-index:50; background:#163247; padding:8px clamp(12px,5vw,64px); display:flex; gap:6px; align-items:center; overflow-x:auto; overflow-y:hidden; white-space:nowrap; box-sizing:border-box; scrollbar-width:none; }
      .bimed-staff-nav::-webkit-scrollbar { display:none; }
      .bimed-staff-nav a { color:#fff; text-decoration:none; padding:8px 10px; border-radius:8px; flex:0 0 auto; }
      .bimed-staff-nav a:hover { background:rgba(255,255,255,.08); }
      .bimed-staff-nav strong { color:#fff; margin-right:4px; flex:0 0 auto; }
      @media (max-width:760px) {
        .bimed-staff-nav { gap:2px; padding:7px 10px; }
        .bimed-staff-nav strong { font-size:15px; }
        .bimed-staff-nav a { font-size:14px; padding:7px 9px; }
        main { max-width:100%; box-sizing:border-box; overflow-x:hidden; }
        main > div { max-width:100% !important; box-sizing:border-box; padding-left:16px !important; padding-right:16px !important; }
        main > div > section,
        main > div > form { min-width:0 !important; max-width:100% !important; box-sizing:border-box; }
        main [style*="grid-template-columns"] { grid-template-columns:minmax(0,1fr) !important; }
        main [style*="display: flex"] { min-width:0 !important; flex-wrap:wrap !important; }
        main [style*="display: grid"] { min-width:0 !important; }
        main img { max-width:100%; }
        main h1 { font-size:clamp(30px,8vw,42px) !important; line-height:1.08; overflow-wrap:anywhere; }
        main h2 { font-size:clamp(23px,6vw,32px); line-height:1.15; overflow-wrap:anywhere; }
        main p { overflow-wrap:anywhere; }
        main button, main input, main select, main textarea { max-width:100%; box-sizing:border-box; }
      }
    `}</style>
    <nav className="bimed-staff-nav" aria-label="BIMED staff navigation">
      <strong>BIMED Portal</strong>
      <Link href="/staff">Dashboard</Link>
      <Link href="/staff/messages" style={{ fontWeight:800 }}>Messages</Link>
      <Link href="/staff/rota">Rota</Link>
      <Link href="/staff/attendance">Attendance</Link>
      <Link href="/staff/travel">Travel to Ireland</Link>
    </nav>
    {children}
  </>;
}
