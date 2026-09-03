import type { ReactNode } from 'react';
import EmploymentContractLetterhead from '@/components/EmploymentContractLetterhead';
import type { ContractTemplate } from '@/lib/contract-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function EmploymentContractDocument({ template }: { template: ContractTemplate }) {
  return (
    <EmploymentContractLetterhead>
      <section className="contract-section">
        <div className="contract-actions">
          <span className="pill">CONTRACT OF EMPLOYMENT</span>
          <PrintContractButton />
        </div>

        <div className="contract-meta">
          <div>
            <span>Document title</span>
            <strong>{template.documentTitle}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{template.roleLabel}</strong>
          </div>
          <div>
            <span>Effective date</span>
            <strong>{template.effectiveDate}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>Final</strong>
          </div>
        </div>

        <h1>{template.roleLabel} Employment Contract</h1>
        <p className="contract-intro">{template.intro}</p>

        <div className="contract-callout">
          <strong>Notes</strong>
          <ul className="contract-bullets">
            {template.templateNotes.map((note) => (
              <li key={note}>{withPlaceholders(note)}</li>
            ))}
          </ul>
        </div>

        <div className="contract-grid">
          <div className="contract-panel">
            <h2>How this document is issued</h2>
            <ul className="contract-bullets">
              {template.howToUse.map((point) => (
                <li key={point}>{withPlaceholders(point)}</li>
              ))}
            </ul>
          </div>

          <div className="contract-panel">
            <h2>Employee details</h2>
            <div className="contract-field-grid">
              {template.editableFields.map((field) => (
                <div className="contract-field" key={field.label}>
                  <span>{field.label}</span>
                  <strong>{withPlaceholders(field.value)}</strong>
                  {field.note ? <small>{field.note}</small> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

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

        <section className="contract-panel contract-schedules">
          <h2>Schedules</h2>
          <div className="contract-schedule-list">
            {template.schedules.map((schedule) => (
              <section className="contract-schedule" key={schedule.heading}>
                <h3>{schedule.heading}</h3>
                {schedule.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{withPlaceholders(paragraph)}</p>
                ))}
                {schedule.bullets ? (
                  <ul className="contract-bullets">
                    {schedule.bullets.map((bullet) => (
                      <li key={bullet}>{withPlaceholders(bullet)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </section>

        <section className="contract-panel contract-body">
          <h2>Signatures</h2>
          <p className="contract-intro">{withPlaceholders(template.closingNote)}</p>
          <p className="contract-intro">
            Keep the signed and countersigned copy on file together with the Employee Handbook, privacy notice and any permit or vetting
            documents that apply.
          </p>
        </section>

        <section className="contract-signatures">
          <div>
            <span>For Bimed Healthcare Limited</span>
            <div className="signature-line signature-line-signed">{template.employerSignatory.name}</div>
            <strong>{template.employerSignatory.name}</strong>
            <small>{template.employerSignatory.title}</small>
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

// Every fill-in-the-blank in the templates is wrapped in square brackets. Highlight each one so a
// drafter cannot mistake an unfilled blank for finished contract wording.
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
