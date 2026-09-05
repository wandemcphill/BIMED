import type { Metadata } from 'next';
import SecondInterviewForm from '@/components/SecondInterviewForm';
import { getSecondInterviewByToken } from '@/lib/second-interview';
import { getSecondInterviewQuestions } from '@/lib/interview-questions';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Second Interview',
  description: 'Complete your second interview with Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string }>;
};

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">SECOND INTERVIEW</span>
            <h1>{title}</h1>
            <p className="muted">{body}</p>
          </div>
          <div className="gate-note">
            <strong>Need help?</strong>
            <p>Contact the Bimed Healthcare recruitment team if you believe this is a mistake.</p>
            <div className="gate-contact">
              <span>Recruitment support</span>
              <strong>recruitment@bimedhealthcare.com</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function SecondInterviewPage({ params }: PageProps) {
  const { token } = await params;

  let interview;
  try {
    interview = await getSecondInterviewByToken(token);
  } catch {
    return (
      <GateMessage
        title="Temporarily unavailable"
        body="We could not load your interview right now. Please try again shortly, or contact the Bimed recruitment team."
      />
    );
  }

  if (!interview) {
    return <GateMessage title="Link not valid" body="This second interview link is not valid. Please contact the Bimed recruitment team." />;
  }

  if (interview.status === 'sent' && interview.expires_at && new Date(interview.expires_at).getTime() < Date.now()) {
    return <GateMessage title="Link expired" body="This second interview link has expired. Please contact the Bimed recruitment team to have it reissued." />;
  }

  if (interview.status === 'completed') {
    return (
      <main className="wrap">
        <section className="card">
          <span className="pill">SECOND INTERVIEW</span>
          <h1>Thank you</h1>
          <p className="muted">
            Your second interview answers have already been submitted, on{' '}
            {interview.completed_at ? new Date(interview.completed_at).toLocaleDateString('en-GB', { dateStyle: 'medium' }) : 'file'}.
            The Bimed recruitment team will be in touch with next steps.
          </p>
        </section>
      </main>
    );
  }

  let roleApplied: string | null = null;
  try {
    const { data } = await db().from('recruitment_applications').select('role_applied').eq('id', interview.application_id).maybeSingle();
    roleApplied = data?.role_applied ?? null;
  } catch {
    // Falls back to the frontline-care question set below if this lookup fails.
  }

  return (
    <main className="wrap">
      <section className="card">
        <span className="pill">SECOND INTERVIEW</span>
        <h1>Your second interview</h1>
        <p className="muted">
          These questions cover real care scenarios you may face on the job. Answer honestly, in your own words - type your
          answer or record a voice note for each question.
        </p>
        <SecondInterviewForm token={token} questions={getSecondInterviewQuestions(roleApplied)} />
      </section>
    </main>
  );
}
