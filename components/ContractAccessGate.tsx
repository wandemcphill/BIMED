export default function ContractAccessGate({ reason }: { reason: 'unauthorized' | 'not_found' | 'blocked' }) {
  const blocked = reason === 'blocked';

  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">PRE-FILLED CONTRACT</span>
            <h1>
              {reason === 'unauthorized'
                ? 'Sign in required'
                : blocked
                  ? 'Contract not ready for issue'
                  : 'Application not found'}
            </h1>
            <p className="muted">
              {reason === 'unauthorized'
                ? 'This link pre-fills a candidate\'s personal details. Sign in to the admin dashboard first, then reopen it.'
                : blocked
                  ? 'This permit-stage contract is deliberately locked until the overseas hire has completed the required accommodation step and submitted the initial travel itinerary. It is separate from the earlier onboarding contract.'
                  : 'The application this link points to could not be found. It may have been removed.'}
            </p>
          </div>
          <div className="gate-note">
            <strong>What to do next</strong>
            <p>
              {reason === 'unauthorized'
                ? 'Open the admin dashboard, sign in, then open the DETE permit-stage contract from an eligible overseas permit case.'
                : blocked
                  ? 'Return to the overseas permit case, complete the accommodation route and travel itinerary, then reopen the permit-stage contract.'
                  : 'Return to the admin dashboard and re-open the candidate record.'}
            </p>
            <a className="secondary link-button" href="/admin">
              Go to admin dashboard
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
