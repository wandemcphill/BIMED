import type { ReactNode } from 'react';
import EmploymentContractLetterhead from '@/components/EmploymentContractLetterhead';
import type { ContractTemplate } from '@/lib/contract-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function EmploymentContractDocument({
  template,
  employeeSignatureSlot,
  prefilledFor,
  employerSignatureDate,
}: {
  template: ContractTemplate;
  employeeSignatureSlot?: ReactNode;
  prefilledFor?: { name: string; email: string };
  employerSignatureDate?: string | null;
}) {
  const employeeName = template.editableFields.find((field) => field.label === 'Employee name')?.value || 'Employee';
  const bimedId = template.editableFields.find((field) => field.label === 'BIMED ID')?.value;
  const primaryAssignment = template.editableFields.find((field) => field.label === 'Place of Primary Assignment')?.value;
  const accommodation = template.editableFields.find((field) => field.label === 'Accommodation arrangement')?.value;
  const departureAirport = template.editableFields.find((field) => field.label === 'Departure airport')?.value;
  const arrivalAirport = template.editableFields.find((field) => field.label === 'Final airport in Ireland')?.value;
  const travellingParty = template.editableFields.find((field) => field.label === 'Travelling party')?.value;

  return (
    <EmploymentContractLetterhead>
      <section className="contract-section">
        <div className="contract-actions">
          <div>
            <span className="pill">CONTRACT OF EMPLOYMENT</span>
            <div className="contract-document-purpose">DETE employment-permit supporting contract</div>
          </div>
          <PrintContractButton />
        </div>

        {prefilledFor ? (
          <div className="contract-prefill-notice" role="status">
            <strong>Canonical BIMED record</strong>
            <span>
              This employment contract has been populated from the recorded BIMED employment data for {prefilledFor.name}. Operational particulars such as assignment, accommodation and travel update from the linked portal records.
            </span>
          </div>
        ) : null}

        <div className="contract-meta contract-meta-four">
          <div>
            <span>Document title</span>
            <strong>{template.documentTitle}</strong>
          </div>
          <div>
            <span>Role</span>
            <strong>{template.roleLabel}</strong>
          </div>
          <div>
            <span>Issued / effective record</span>
            <strong>{template.effectiveDate}</strong>
          </div>
          <div>
            <span>Contract status</span>
            <strong>{bimedId ? 'BIMED staff contract · ' + bimedId : 'Employment contract'}</strong>
          </div>
        </div>

        <h1>{template.roleLabel} Employment Contract</h1>
        <p className="contract-intro">{template.intro}</p>

        <div className="contract-key-facts">
          <div>
            <span>Primary assignment</span>
            <strong>{withPlaceholders(primaryAssignment || 'To be confirmed')}</strong>
          </div>
          <div>
            <span>Accommodation</span>
            <strong>{withPlaceholders(accommodation || 'To be confirmed')}</strong>
          </div>
          <div>
            <span>Initial departure</span>
            <strong>{withPlaceholders(departureAirport || 'To be confirmed')}</strong>
          </div>
          <div>
            <span>Final airport in Ireland</span>
            <strong>{withPlaceholders(arrivalAirport || 'To be confirmed')}</strong>
          </div>
          <div>
            <span>Travelling party</span>
            <strong>{withPlaceholders(travellingParty || 'To be confirmed')}</strong>
          </div>
        </div>

        <div className="contract-panel">
          <h2>Employment and permit particulars</h2>
          <div className="contract-field-grid">
            {template.editableFields.map((field) => (
              <div className="contract-field" key={field.label}>
                <span>{field.label}</span>
                <strong>{withPlaceholders(field.value)}</strong>
                {field.note ? <small>{withPlaceholders(field.note)}</small> : null}
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
            Keep the signed and countersigned copy on file together with the Employee Handbook, privacy notice and any employment-permit, visa or vetting documents that apply.
          </p>
        </section>

        <section className="contract-signatures">
          <div>
            <span>For Bimed Healthcare Limited</span>
            <div className="signature-line signature-line-signed">{template.employerSignatory.name}</div>
            <strong>{template.employerSignatory.name}</strong>
            <small>{template.employerSignatory.title}</small>
            <small>Dated: {employerSignatureDate ? formatSignatureDate(employerSignatureDate) : formatSignatureDate()}</small>
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

function formatSignatureDate(value?: string): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const placeholderPattern = /(\[[^\]]+\])/g;

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
