import { notFound } from 'next/navigation';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCandidatePacketAccess, getPacketDefinition } from '@/lib/document-packets';
import { db } from '@/lib/db';
import CandidatePacketInteractive from '@/components/CandidatePacketInteractive';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ token: string }> };

export default async function CandidatePacketPage({ params }: PageProps) {
  const { token } = await params;
  const access = await getCandidatePacketAccess(token);
  if (!access) notFound();

  const packet = getPacketDefinition(access.packet_slug);
  if (!packet || !packet.candidateVisible) notFound();

  const { data: application } = await db()
    .from('recruitment_applications')
    .select('id,full_name,email,role_applied,start_date,living_in_ireland')
    .eq('id', access.application_id)
    .maybeSingle();

  if (!application) notFound();

  if (packet.mode !== 'reading' && packet.mode !== 'acknowledgement') {
    return (
      <main style={{ minHeight: '100vh', background: '#f3f7f9', color: '#243039', padding: '28px 16px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <header style={{ background: '#163247', color: '#fff', borderRadius: 14, padding: '22px 26px', marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Bimed Healthcare</div>
            <div style={{ opacity: .78, fontSize: 12, marginTop: 3 }}>Private candidate document</div>
          </header>
          <CandidatePacketInteractive
            token={token}
            title={packet.title}
            description={packet.description}
            mode={packet.mode}
            application={application}
            initialResponse={(access.response_data || {}) as Record<string, unknown>}
            completedAt={access.completed_at}
          />
          <p style={{ margin: '16px 0 0', fontSize: 12, color: '#66717a' }}>This private link expires on {new Date(access.expires_at).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
        </div>
      </main>
    );
  }

  const source = await fs.readFile(/* turbopackIgnore: true */ path.join(process.cwd(), packet.sourcePath || ''), 'utf8');
  const personalised = source
    .replaceAll('[NAME]', application.full_name || '')
    .replaceAll('[EMPLOYEE FULL NAME]', application.full_name || '')
    .replaceAll('[ROLE]', application.role_applied || '')
    .replaceAll('[ROLE TITLE]', application.role_applied || '')
    .replaceAll('[DATE]', application.start_date || 'To be confirmed');

  return (
    <main style={{ minHeight: '100vh', background: '#f3f7f9', color: '#243039', padding: '28px 16px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <header style={{ background: '#163247', color: '#fff', borderRadius: 14, padding: '22px 26px', marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Bimed Healthcare</div>
          <div style={{ opacity: .78, fontSize: 12, marginTop: 3 }}>Private candidate document</div>
        </header>
        <section style={{ background: '#fff', border: '1px solid #d7e1e6', borderRadius: 14, padding: '28px' }}>
          <div style={{ display: 'inline-block', padding: '5px 9px', borderRadius: 999, background: '#e8f4f8', color: '#0a6f95', fontSize: 12, fontWeight: 800, marginBottom: 14 }}>PRIVATE LINK</div>
          <div style={{ color: '#66717a', fontSize: 13, marginBottom: 20 }}>Candidate document</div>
          <h1 style={{ marginTop: 0 }}>{packet.title}</h1>
          <p style={{ color: '#51606a', lineHeight: 1.6 }}>{packet.description}</p>
          <article style={{ marginTop: 24, lineHeight: 1.7, color: '#34424b' }} dangerouslySetInnerHTML={{ __html: personalised.replace(/\n/g, '<br />') }} />
        </section>
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#66717a' }}>This private link expires on {new Date(access.expires_at).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
      </div>
    </main>
  );
}
