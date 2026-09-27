export default function DeteContractAccessGate({ reason }: { reason: 'unauthorized' | 'not_found' | 'blocked' }) {
  const blocked = reason === 'blocked';

  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">DETE PERMIT-STAGE CONTRACT</span>
            <h1>
              {reason === 'unauthorized'
                ? 'Admin sign in required'
                : blocked
                  ? 'Permit-stage contract not ready'
                  : 'Staff record not found'}
            </h1>
            <p className="muted">
              {reason === 'unauthorized'
                ? 'This permit-stage document contains employment and relocation particulars. Sign in to the BIMED admin dashboard first.'
                : blocked
                  ? 'This document is intentionally issued only after the earlier onboarding contract is evidenced, the accommodation route is complete, the employment location and permit route are recorded, and the initial travel itinerary has been submitted.'
                  : 'The BIMED staff record for this permit-stage contract could not be found.'}
            </p>
          </div>
          <div className="gate-note">
            <strong>Next step</strong>
            <p>
              {reason === 'unauthorized'
                ? 'Open the BIMED admin dashboard and then reopen the DETE permit-stage contract from the eligible overseas permit case.'
                : blocked
                  ? 'Return to Overseas Permit & Sponsorship, complete the missing prerequisite, then reopen the document.'
                  : 'Return to the workforce or overseas permit workspace and select the correct staff record.'}
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
