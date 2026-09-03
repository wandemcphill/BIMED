export default function ContractAccessGate({ reason }: { reason: 'unauthorized' | 'not_found' }) {
  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">PRE-FILLED CONTRACT</span>
            <h1>{reason === 'unauthorized' ? 'Sign in required' : 'Application not found'}</h1>
            <p className="muted">
              {reason === 'unauthorized'
                ? 'This link pre-fills a candidate\'s personal details. Sign in to the admin dashboard first, then reopen it.'
                : 'The application this link points to could not be found. It may have been removed.'}
            </p>
          </div>
          <div className="gate-note">
            <strong>What to do next</strong>
            <p>
              {reason === 'unauthorized'
                ? 'Open the admin dashboard, sign in, then use "Generate contract" from the candidate record.'
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
