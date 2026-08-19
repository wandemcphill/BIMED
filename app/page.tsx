import Image from 'next/image';
import Header from '@/components/Header';
import { recruitmentCopy } from '@/lib/recruitment-config';

type LifeAtBimedPhoto = {
  src: string;
  alt: string;
  title: string;
  caption: string;
  layout: 'hero' | 'tall' | 'wide' | 'compact';
};

const lifeAtBimed: LifeAtBimedPhoto[] = [
  {
    src: '/bimed/photos/reception.png',
    alt: 'Bimed reception area with welcoming front desk staff',
    title: 'Reception and first impressions',
    caption: 'A calm, professional welcome for residents, families and visitors.',
    layout: 'hero',
  },
  {
    src: '/bimed/photos/care-staff.png',
    alt: 'Bimed care staff talking together in a bright common area',
    title: 'Supportive care teams',
    caption: 'Friendly colleagues working together in everyday care settings.',
    layout: 'tall',
  },
  {
    src: '/bimed/photos/activity-cooking.png',
    alt: 'Bimed care team leading a cooking activity with residents',
    title: 'Shared kitchen activities',
    caption: 'Practical, people-focused activities that make daily life feel familiar.',
    layout: 'wide',
  },
  {
    src: '/bimed/photos/activity-art.png',
    alt: 'Bimed residents and staff taking part in an art activity',
    title: 'Creative engagement',
    caption: 'Meaningful activities that support wellbeing and social connection.',
    layout: 'compact',
  },
  {
    src: '/bimed/photos/activity-garden.png',
    alt: 'Bimed residents and staff gardening together outdoors',
    title: 'Outdoor and garden moments',
    caption: 'Fresh-air activities that keep communities active and engaged.',
    layout: 'tall',
  },
] as const;

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
          <section className="subcard life-section">
            <div className="section-intro">
              <h2>Life at Bimed</h2>
              <p className="muted">
                A glimpse of the welcoming, resident-focused environments that Bimed candidates are joining.
              </p>
            </div>
            <div className="life-gallery" aria-label="Bimed workplace photos">
              {lifeAtBimed.map((photo) => (
                <figure className={`life-card ${photo.layout}`} key={photo.src}>
                  <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 700px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                  <figcaption>
                    <strong>{photo.title}</strong>
                    <span>{photo.caption}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
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
