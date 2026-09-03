import type { ReactNode } from 'react';
import EmploymentContractLetterhead from '@/components/EmploymentContractLetterhead';
import type { DocumentTemplate } from '@/lib/document-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function PolicyDocument({ template }: { template: DocumentTemplate }) {
  return (
    <EmploymentContractLetterhead>
      <section className="contract-section">
        <div className="contract-actions">
          <span className="pill">{template.documentTitle.toUpperCase()}</span>
          <PrintContractButton />
        </div>

        <div className="contract-meta">
          <div>
            <span>Document title</span>
            <strong>{template.documentTitle}</strong>
          </div>
          {template.roleLabel && (
            <div>
              <span>Role</span>
              <strong>{template.roleLabel}</strong>
            </div>
          )}
          <div>
            <span>Effective date</span>
            <strong>{template.effectiveDate}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>Final</strong>
          </div>
        </div>

        <h1>{template.documentTitle}</h1>
        <p className="contract-intro">{template.intro}</p>

        {template.templateNotes.length > 0 && (
          <div className="contract-callout">
            <strong>Notes</strong>
            <ul className="contract-bullets">
              {template.templateNotes.map((note) => (
                <li key={note}>{withPlaceholders(note)}</li>
              ))}
            </ul>
          </div>
        )}

        {template.sections.map((section) => (
          <section className="contract-panel contract-body" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{withPlaceholders(paragraph)}</p>
            ))}
            {section.bullets ? (
              <ul className="contract-bullets">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{withPlaceholders(bullet)}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="contract-signatures">
          <div>
            <span>For Bimed Healthcare Limited</span>
            <div className="signature-line signature-line-signed">{template.signatory.name}</div>
            <strong>{template.signatory.name}</strong>
            <small>{template.signatory.title}</small>
            <small>Dated: {formatSignatureDate()}</small>
          </div>
          <div>
            <span>Employee</span>
            <div className="signature-line" />
            <strong>{withPlaceholders('[Insert employee name]')}</strong>
            <small>Dated: [Insert date signed]</small>
          </div>
        </section>
      </section>
    </EmploymentContractLetterhead>
  );
}

function formatSignatureDate(): string {
  return new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const placeholderPattern = /(\[[^[\]]+\])/g;

function withPlaceholders(text: string): ReactNode[] {
  return text.split(placeholderPattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark className="contract-placeholder" key={index}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}
