import type { ReactNode } from 'react';
import EmploymentContractLetterhead from '@/components/EmploymentContractLetterhead';
import type { ContractTemplate } from '@/lib/contract-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function EmploymentContractDocument({
  template,
  employeeSignatureSlot,
  prefilledFor,
}: {
  template: ContractTemplate;
  /** Replaces the default blank employee signature line - used by the live e-signing page. */
  employeeSignatureSlot?: ReactNode;
  /** Candidate identity shown when the contract was opened from a specific application. */
  prefilledFor?: { name: string; email: string };
}) {
  const employeeName = template.editableFields.find((field) => field.label === 'Employee name')?.value || 'Employee';
  return (
    <EmploymentContractLetterhead>
      <section className="contract-section">
        <div className="contract-actions">
          <span className="pill">CONTRACT OF EMPLOYMENT</span>
          <PrintContractButton />
        </div>

        {prefilledFor ? (
          <div className="contract-prefill-notice" role="status">
            <strong>Candidate details</strong>
            <span>
              This employment contract has been populated for {prefilledFor.name}. The employment details below come from the candidate's recruitment record.
            </span>
          </div>
        ) : null}

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

        <div className="contract-panel">
          <h2>Employment details</h2>
          <div className="contract-field-grid">
            {template.editableFields.map((field) => (
              <div className="contract-field" key={field.label}>
                <span>{field.label}</span>
                <strong>{withPlaceholders(field.value)}</strong>
              </div>
            ))}
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
            {employeeSignatureSlot ?? (
              <>
                <div className="signature-line" />
                <strong>{withPlaceholders(employeeName)}</strong>
                <small>Date signed: ____________________</small>
              </>
            )}
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