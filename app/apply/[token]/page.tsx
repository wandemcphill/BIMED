import Header from '@/components/Header';
import CandidateForm from '@/components/CandidateForm';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/token';

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function GateMessage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="card success-card">
      <h1>{title}</h1>
      <p className="muted">{body}</p>
    </section>
  );
}

export default async function Page({ params }: PageProps) {
  const { token: inviteToken } = await params;
  const client = db();
  const { data: invite, error } = await client
    .from('recruitment_invites')
    .select('*')
    .eq('token_hash', hashToken(inviteToken))
    .maybeSingle();

  let status: 'valid' | 'invalid' | 'expired' | 'used' = 'valid';

  if (error || !invite) {
    status = 'invalid';
  } else if (invite.used_at) {
    status = 'used';
  } else if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    status = 'expired';
  }

  return (
    <>
      <Header />
      <main className="wrap">
        {status === 'invalid' && (
          <GateMessage
            title="Invitation unavailable"
            body="This private application link is not valid. Please contact the Bimed recruitment team for support."
          />
        )}
        {status === 'expired' && (
          <GateMessage
            title="Invitation expired"
            body="This private application link has expired. Please contact the Bimed recruitment team if you still need access."
          />
        )}
        {status === 'used' && (
          <GateMessage
            title="Application already submitted"
            body="This invitation has already been used. If you need to update your details, please contact the Bimed recruitment team."
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
