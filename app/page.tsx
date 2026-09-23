import Image from 'next/image';
import Header from '@/components/Header';
import { recruitmentContacts, recruitmentCopy } from '@/lib/recruitment-config';

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
          <p className="muted">{recruitmentCopy.invitationOnly}</p>

          <div className="split-grid">
            <div className="subcard">
              <h2>How recruitment works</h2>
              <ol className="steps">
                <li>Official recruitment channels receive initial candidate enquiries and CVs.</li>
                <li>Selected candidates receive a private invitation link from Bimed.</li>
                <li>The invitation opens a guided online application with autosaved progress.</li>
                <li>Supporting documents are requested separately by email after submission.</li>
              </ol>
            </div>
            <div className="subcard">
              <h2>Current recruitment information</h2>
              <ul className="notes-list">
                <li>Visa sponsorship may be available to eligible overseas and Ireland-based applicants.</li>
                <li>Recruitment covers Dublin, Cork and Galway.</li>
                <li>Local recruitment: {recruitmentContacts.ireland}</li>
                <li>Overseas recruitment: {recruitmentContacts.overseas}</li>
                <li>This portal is for invited candidates and is not a public self-registration form.</li>
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
            <b>Already have a BIMED Staff Portal account?</b>
            <p className="muted" style={{ margin: '6px 0 10px' }}>
              Use your BIMED ID or BIMED email and the password you created during activation.
            </p>
            <a className="link-button" href="/staff/login">
              Sign in to Staff Portal →
            </a>
          </div>

          <div className="notice">
            <b>Not invited yet?</b>
            <p className="muted" style={{ marginBottom: 0 }}>
              Please use Bimed Healthcare&apos;s official recruitment channels first. The recruitment team will issue a private portal invitation when your application is ready for the online stage.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
