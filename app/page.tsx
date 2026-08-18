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
          <div className="notice">
            <b>How it works</b>
            <ol className="steps">
              <li>Selected candidates receive a private invitation link from Bimed.</li>
              <li>The link opens a guided online application.</li>
              <li>Supporting documents are sent separately by email after submission.</li>
            </ol>
          </div>
          <p className="muted">
            If you have not been invited, please continue using Bimed Healthcare&apos;s official recruitment channels.
          </p>
        </section>
      </main>
    </>
  );
}
