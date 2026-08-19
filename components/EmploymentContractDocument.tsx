import EmploymentContractLetterhead from '@/components/EmploymentContractLetterhead';
import type { ContractTemplate } from '@/lib/contract-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function EmploymentContractDocument({ template }: { template: ContractTemplate }) {
  return (
    <EmploymentContractLetterhead>
      <section className="contract-section">
        <div className="contract-actions">
          <span className="pill">PRINT TEMPLATE</span>
          <PrintContractButton />
        </div>

        <div className="contract-meta">
          <div>
            <span>Document title</span>
            <strong>{template.documentTitle}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>Draft for Bimed review</strong>
          </div>
          <div>
            <span>Effective date</span>
            <strong>{template.effectiveDate}</strong>
          </div>
        </div>

        <h1>{template.roleLabel} Employment Agreement</h1>
        <p className="contract-intro">{template.intro}</p>

        <div className="contract-callout">
          <strong>Template note</strong>
          <p>
            This shell preserves Bimed branding and layout while leaving the contract wording editable until the final legal text is
            approved.
          </p>
        </div>

        <div className="contract-grid">
          <div className="contract-panel">
            <h2>Employment overview</h2>
            <ul className="contract-bullets">
              {template.overviewPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>

          <div className="contract-panel">
            <h2>Contract details</h2>
            <dl className="contract-list">
              {template.contractDetails.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {template.clauseSections.map((section) => (
          <section className="contract-panel contract-body" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}

        <section className="contract-signatures">
          <div>
            <span>For Bimed Healthcare Limited</span>
            <div className="signature-line" />
            <strong>Authorised signatory</strong>
          </div>
          <div>
            <span>Employee</span>
            <div className="signature-line" />
            <strong>[Insert employee name]</strong>
          </div>
        </section>
      </section>
    </EmploymentContractLetterhead>
  );
}
