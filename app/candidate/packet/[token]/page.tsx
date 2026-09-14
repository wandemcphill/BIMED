import fs from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import CandidatePacketInteractive from '@/components/CandidatePacketInteractive';
import { getPacketAccess, getPacketDefinition, type PacketSlug } from '@/lib/document-packets';
import { db } from '@/lib/db';

function renderMarkdown(source: string) {
  return source.split(/\r?\n/).map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div key={index} style={{ height: 8 }} />;
    if (line.startsWith('# ')) return <h1 key={index} style={{ margin: '0 0 18px', color: '#163247' }}>{line.slice(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={index} style={{ margin: '24px 0 10px', color: '#163247', fontSize: 20 }}>{line.slice(3)}</h2>;
    if (line.startsWith('### ')) return <h3 key={index} style={{ margin: '20px 0 8px', color: '#163247' }}>{line.slice(4)}</h3>;
    if (line.startsWith('- ')) return <li key={index} style={{ margin: '6px 0' }}>{line.slice(2).replace(/\*\*(.*?)\*\*/g, '$1')}</li>;
    const cleaned = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\[([ x])\]/gi, '');
    if (/^\*\*(Document status|Audience|Owner|Review|Status|Timing|Pathway|Candidate|Role|Proposed start date|BIMED contact|Employee|Manager):/.test(cleaned)) return null;
    return <p key={index} style={{ margin: '0 0 12px', lineHeight: 1.7 }}>{cleaned}</p>;
  });
}

type PageProps = { params: Promise<{ token: string }> };

export default async function CandidatePacketPage({ params }: PageProps) {
  const { token } = await params;
  const access = await getPacketAccess(token);
  if (!access) notFound();

  const packet = getPacketDefinition(access.packet_slug);
  if (!packet?.sourcePath || !packet.candidateVisible) notFound();

  const client = db();
  const { data: application } = await client.from('recruitment_applications')
    .select('full_name, role_applied, start_date, country_of_residence, address, email, phone, date_of_birth, nationality')
    .eq('id', access.application_id)
    .maybeSingle();
  if (!application) notFound();

  if (packet.mode !== 'reading') {
    return (
      <main style={{ minHeight: '100vh', background: '#f3f7f9', color: '#243039', padding: '28px 16px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <header style={{ background: '#163247', color: '#fff', borderRadius: 14, padding: '22px 26px', marginBottom: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Bimed Healthcare</div>
            <div style={{ opacity: .78, fontSize: 12, marginTop: 3 }}>Private candidate document</div>
          </header>
          <CandidatePacketInteractive
            token={token}
            slug={access.packet_slug as PacketSlug}
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

  const source = await fs.readFile(/* turbopackIgnore: true */ path.join(process.cwd(), packet.sourcePath), 'utf8');
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
          <div style={{ color: '#66717a', fontSize: 13, marginBottom: 20 }}>
            Prepared for <strong>{application.full_name}</strong>{application.role_applied ? ` · ${application.role_applied}` : ''}
          </div>
          <article>{renderMarkdown(personalised)}</article>
          <hr style={{ border: 0, borderTop: '1px solid #d7e1e6', margin: '28px 0 18px' }} />
          <p style={{ margin: 0, fontSize: 12, color: '#66717a' }}>This private link expires on {new Date(access.expires_at).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}. BIMED controlled templates and applicable policies take precedence.</p>
        </section>
      </div>
    </main>
  );
}
