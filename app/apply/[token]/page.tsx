import Header from '@/components/Header';
import CandidateForm from '@/components/CandidateForm';
import { db } from '@/lib/db';
import { recruitmentContacts } from '@/lib/recruitment-config';
import { hashToken } from '@/lib/token';

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function GateMessage({
  title,
  body,
  note,
}: {
  title: string;
  body: string;
  note: string;
}) {
  return (
    <section className="card gate-card">
      <div className="gate-hero">
        <div>
          <span className="pill">PRIVATE INVITATION</span>
          <h1>{title}</h1>
          <p className="muted">{body}</p>
        </div>
        <div className="gate-note">
          <strong>What to do next</strong>
          <p>{note}</p>
          <div className="gate-contact">
            <span>Recruitment support</span>
            <strong>{recruitmentContacts.admin}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function Page({ params }: PageProps) {
  const { token: inviteToken } = await params;
  let status: 'valid' | 'invalid' | 'expired' | 'used' | 'unavailable' = 'valid';
  let invite:
    | {
        candidate_name: string | null;
        candidate_email: string | null;
        role: string | null;
        used_at: string | null;
        expires_at: string | null;
      }
    | null = null;

  try {
    const client = db();
    const { data, error } = await client
      .from('recruitment_invites')
      .select('candidate_name,candidate_email,role,used_at,expires_at')
      .eq('token_hash', hashToken(inviteToken))
      .maybeSingle();

    invite = data;

    if (error || !invite) {
      status = 'invalid';
    } else if (invite.used_at) {
      status = 'used';
    } else if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      status = 'expired';
    }
  } catch {
    status = 'unavailable';
  }

  return (
    <>
      <Header />
      <main className="wrap">
        {status === 'invalid' && (
          <GateMessage
            title="Invitation unavailable"
            body="This private application link is not valid. Please contact the Bimed recruitment team for support."
            note="If you believe this is a mistake, ask the Bimed recruitment team to issue a fresh private link."
          />
        )}
        {status === 'expired' && (
          <GateMessage
            title="Invitation expired"
            body="This private application link has expired. Please contact the Bimed recruitment team if you still need access."
            note="The team can review your invitation and send a replacement if your application is still active."
          />
        )}
        {status === 'used' && (
          <GateMessage
            title="Application already submitted"
            body="This invitation has already been used. If you need to update your details, please contact the Bimed recruitment team."
            note="If you need to make a change, contact the team before submitting a second application."
          />
        )}
        {status === 'unavailable' && (
          <GateMessage
            title="Application temporarily unavailable"
            body="The private application area is not fully configured yet. Please contact the Bimed recruitment team for access support."
            note="Once the recruitment environment variables are connected, this link will open the candidate application normally."
          />
        )}
        {status === 'valid' && (
          <CandidateForm
            token={inviteToken}
            invite={{
              candidate_name: invite?.candidate_name,
              candidate_email: invite?.candidate_email,
              role: invite?.role,
            }}
          />
        )}
      </main>
    </>
  );
}
