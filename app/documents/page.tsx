import Link from 'next/link';
import { jobDescriptionTemplates, employeeHandbookTemplate } from '@/lib/document-templates';

export const metadata = {
  title: 'Bimed Healthcare | Onboarding Documents',
  description: 'Print-ready job descriptions and employee handbook for Bimed Healthcare',
};

export default function DocumentsHubPage() {
  return (
    <main className="wrap">
      <section className="card">
        <span className="pill">ONBOARDING DOCUMENTS</span>
        <h1>Job Descriptions and Employee Handbook</h1>
        <p className="muted">
          Issue these alongside the employment contract. Each page uses the Bimed letterhead and is print-ready.
        </p>

        <div className="template-grid">
          {jobDescriptionTemplates.map((template) => (
            <article className="subcard template-card" key={template.slug}>
              <h2>{template.roleLabel} - Job Description</h2>
              <p className="muted">{template.intro}</p>
              <Link className="secondary link-button" href={`/documents/job-description/${template.slug}`}>
                Open job description
              </Link>
            </article>
          ))}

          <article className="subcard template-card" key={employeeHandbookTemplate.slug}>
            <h2>{employeeHandbookTemplate.documentTitle}</h2>
            <p className="muted">{employeeHandbookTemplate.intro}</p>
            <Link className="secondary link-button" href={`/documents/${employeeHandbookTemplate.slug}`}>
              Open employee handbook
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}
