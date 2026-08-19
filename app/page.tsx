import Header from '@/components/Header';
import { recruitmentCopy } from '@/lib/recruitment-config';

export default function Home() {
  return (
    <>
      <Header />
      <main className="wrap">
        <section className="card hero">
          <span className="pill">PRIVATE CANDIDATE PORTAL</span>
          <h1>Bimed Healthcare Recruitment</h1>
          <p className="muted">
            {recruitmentCopy.invitationOnly}
          </p>
          <div className="split-grid">
            <div className="subcard">
              <h2>How it works</h2>
              <ol className="steps">
                <li>Selected candidates receive a private invitation link from Bimed.</li>
                <li>The link opens a guided online application.</li>
                <li>Supporting documents are sent separately by email after submission.</li>
              </ol>
            </div>
            <div className="subcard">
              <h2>What to expect</h2>
              <ul className="notes-list">
                <li>Invitation-only access</li>
                <li>Autosaved progress</li>
                <li>Clear review step before submission</li>
                <li>Separate document email routing for Ireland and overseas applicants</li>
              </ul>
            </div>
          </div>
          <div className="notice">
            <b>Not invited yet?</b>
            <p className="muted" style={{ marginBottom: 0 }}>
              If you have not been invited, please continue using Bimed Healthcare&apos;s official recruitment channels.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
