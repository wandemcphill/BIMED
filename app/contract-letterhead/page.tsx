import Link from 'next/link';
import { contractTemplates } from '@/lib/contract-templates';

export const metadata = {
  title: 'Bimed Healthcare | Contract Templates',
  description: 'Print-ready employment contract templates for Bimed Healthcare',
};

export default function ContractLetterheadPage() {
  return (
    <main className="wrap">
      <section className="card">
        <span className="pill">CONTRACT TEMPLATES</span>
        <h1>Bimed Healthcare Employment Contract Shells</h1>
        <p className="muted">
          Choose one of the role-specific draft templates below. Each page uses the Bimed letterhead and leaves the legal wording
          configurable for Bimed approval.
        </p>

        <div className="template-grid">
          {contractTemplates.map((template) => (
            <article className="subcard template-card" key={template.roleSlug}>
              <h2>{template.roleLabel}</h2>
              <p className="muted">{template.intro}</p>
              <Link className="secondary link-button" href={`/contract-letterhead/${template.roleSlug}`}>
                Open template
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
