export default function ContractAccessGate({ reason }: { reason: 'unauthorized' | 'not_found' | 'blocked'; message?: string }) {
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
                  ? 'Private Accommodation is selected, but BIMED has not recorded a verified Irish residential address. Verify the accommodation and address before issuing the final contract.'
                  : 'The application this link points to could not be found. It may have been removed.'}
            </p>
          </div>
          <div className="gate-note">
            <strong>What to do next</strong>
            <p>
              {reason === 'unauthorized'
                ? 'Open the admin dashboard, sign in, then use "Generate contract" from the candidate record.'
                : blocked
                  ? 'Return to the candidate record, verify the accommodation/address or select "Accommodation Not Verified", then generate the contract again.'
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
