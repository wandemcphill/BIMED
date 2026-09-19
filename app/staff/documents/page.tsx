import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStaffSessionFromToken, STAFF_SESSION_COOKIE_NAME } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { normalizeRecruitmentRole, recruitmentRoleSlug } from '@/lib/bimed-role-policy';

export const dynamic = 'force-dynamic';

export default async function StaffDocumentsPage() {
  const cookieStore = await cookies();
  const session = await getStaffSessionFromToken(cookieStore.get(STAFF_SESSION_COOKIE_NAME)?.value);
  if (!session) redirect('/staff/login');

  const { data: staff } = await db()
    .from('recruitment_staff')
    .select('id,application_id,full_name,job_title,status')
    .eq('id', session.staff_id)
    .maybeSingle();

  if (!staff) redirect('/staff/login');

  const role = normalizeRecruitmentRole(staff.job_title);
  const roleSlug = recruitmentRoleSlug(staff.job_title);

  return (
    <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', fontFamily: 'system-ui', padding: 'clamp(16px,4vw,30px)' }}>
      <div style={{ width: 'min(1050px,100%)', margin: '0 auto' }}>
        <Link href="/staff" style={secondary}>← Staff Portal</Link>
        <header style={{ marginTop: 18 }}>
          <div style={eyebrow}>EMPLOYMENT RECORDS</div>
          <h1 style={{ margin: '5px 0 6px', fontSize: 'clamp(30px,6vw,46px)' }}>My Documents</h1>
          <p style={{ color: '#627d98', fontSize: 17, lineHeight: 1.65, maxWidth: 820 }}>
            Employment documents available to your authenticated BIMED Staff Portal account. Use these copies for your own records and do not share private portal links.
          </p>
        </header>

        <section style={card}>
          <div style={eyebrow}>YOUR BIMED RECORD</div>
          <h2 style={{ margin: '5px 0 8px' }}>{staff.full_name}</h2>
          <p style={{ margin: 0, color: '#627d98' }}>{role || staff.job_title || 'BIMED Staff'} · BIMED ID {session.bimed_id}</p>
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Signed employment contract</h2>
          {staff.application_id ? (
            <>
              <p style={copy}>Open the signed contract copy stored against your recruitment record. The document is generated from the contract version BIMED recorded when you signed.</p>
              <Link href="/staff/documents/contract" style={primary}>Open signed contract</Link>
            </>
          ) : (
            <p style={muted}>No recruitment-linked contract record is attached to this staff identity.</p>
          )}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Employee handbook</h2>
          <p style={copy}>BIMED's current employee handbook is available for reference. The Staff Portal remains the authoritative source for any staff-specific notices or controlled onboarding instructions.</p>
          <Link href="/documents/employee-handbook" style={secondary}>Open employee handbook</Link>
        </section>

        {roleSlug ? (
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>{role} job description</h2>
            <p style={copy}>Review the current role information and responsibilities for your recorded BIMED position.</p>
            <Link href={`/documents/job-description/${roleSlug}`} style={secondary}>Open job description</Link>
          </section>
        ) : null}

        <section style={{ ...card, background: '#eefdf8', borderColor: '#b7ead0', marginBottom: 30 }}>
          <strong style={{ color: '#0f766e' }}>Need a document that is missing?</strong>
          <p style={{ margin: '7px 0 12px', color: '#486581', lineHeight: 1.65 }}>Contact BIMED through Staff Portal Messages. Do not send private Staff Portal links or passwords to other people.</p>
          <Link href="/staff/messages" style={primary}>Message BIMED</Link>
        </section>
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5eaf0', borderRadius: 16, padding: 'clamp(17px,3vw,22px)', marginTop: 16, boxShadow: '0 8px 28px rgba(15,23,42,.04)' };
const copy: React.CSSProperties = { color: '#486581', lineHeight: 1.7 };
const muted: React.CSSProperties = { color: '#627d98', lineHeight: 1.65 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 900, letterSpacing: 1.15, color: '#0f766e' };
const secondary: React.CSSProperties = { display: 'inline-block', padding: '10px 13px', border: '1px solid #d9e2ec', borderRadius: 9, background: '#fff', color: '#334e68', fontWeight: 800, textDecoration: 'none' };
const primary: React.CSSProperties = { display: 'inline-block', padding: '11px 15px', border: 0, borderRadius: 9, background: '#0f766e', color: '#fff', fontWeight: 900, textDecoration: 'none' };
