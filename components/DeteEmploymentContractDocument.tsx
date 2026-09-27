import type { ReactNode } from 'react';
import DeteEmploymentContractLetterhead from '@/components/DeteEmploymentContractLetterhead';
import type { ContractTemplate } from '@/lib/contract-templates';
import PrintContractButton from '@/components/PrintContractButton';

export default function DeteEmploymentContractDocument({
  template,
  prefilledFor,
  employerSignatureDate,
}: {
  template: ContractTemplate;
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
    <DeteEmploymentContractLetterhead>
      <section className="dete-contract-section">
        <div className="dete-contract-actions">
          <div>
            <span className="dete-contract-pill">CONTRACT OF EMPLOYMENT</span>
            <div className="dete-contract-purpose">Permit-stage employment contract for Ireland</div>
          </div>
          <PrintContractButton />
        </div>

        {prefilledFor ? (
          <div className="dete-contract-prefill" role="status">
            <strong>Populated from BIMED Staff Portal</strong>
            <span>
              This permit-stage contract is generated only after the prerequisite onboarding contract, accommodation route and initial travel itinerary have been recorded.
            </span>
          </div>
        ) : null}

        <div className="dete-contract-meta">
          {[
            ['Document', template.documentTitle],
            ['Role', template.roleLabel],
            ['Prepared', template.effectiveDate],
            ['BIMED ID', bimedId || 'Not available'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{withPlaceholders(value)}</strong>
            </div>
          ))}
        </div>

        <h1>{template.roleLabel} Employment Contract</h1>
        <p className="dete-contract-intro">{withPlaceholders(template.intro)}</p>

        <section className="dete-contract-key-facts">
          {[
            ['Place of Primary Assignment', primaryAssignment || 'To be confirmed'],
            ['Accommodation', accommodation || 'To be confirmed'],
            ['Departure airport', departureAirport || 'To be confirmed'],
            ['Final airport in Ireland', arrivalAirport || 'To be confirmed'],
            ['Travelling party', travellingParty || 'To be confirmed'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{withPlaceholders(value)}</strong>
            </div>
          ))}
        </section>

        <section className="dete-contract-panel">
          <h2>Employment and permit particulars</h2>
          <div className="dete-contract-field-grid">
            {template.editableFields.map((field) => (
              <div className="dete-contract-field" key={field.label}>
                <span>{field.label}</span>
                <strong>{withPlaceholders(field.value)}</strong>
                {field.note ? <small>{withPlaceholders(field.note)}</small> : null}
              </div>
            ))}
          </div>
        </section>

        {template.sections.map((section) => (
          <section className="dete-contract-panel dete-contract-body" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{withPlaceholders(paragraph)}</p>
            ))}
            {section.bullets?.length ? (
              <ul className="dete-contract-bullets">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{withPlaceholders(bullet)}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="dete-contract-panel dete-contract-schedules">
          <h2>Schedules</h2>
          <div className="dete-contract-schedule-list">
            {template.schedules.map((schedule) => (
              <section className="dete-contract-schedule" key={schedule.heading}>
                <h3>{schedule.heading}</h3>
                {schedule.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{withPlaceholders(paragraph)}</p>
                ))}
                {schedule.bullets?.length ? (
                  <ul className="dete-contract-bullets">
                    {schedule.bullets.map((bullet) => (
                      <li key={bullet}>{withPlaceholders(bullet)}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </section>

        <section className="dete-contract-panel dete-contract-body">
          <h2>Signatures</h2>
          <p className="dete-contract-intro">{withPlaceholders(template.closingNote)}</p>
          <p className="dete-contract-intro">
            This document is the permit-stage contract copy intended for use with the Irish employment permit application. The signed copy should be retained by both parties.
          </p>
        </section>

        <section className="dete-contract-signatures">
          <div>
            <span>For Bimed Healthcare Limited</span>
            <div className="dete-contract-signature-line dete-contract-signature-signed">{template.employerSignatory.name}</div>
            <strong>{template.employerSignatory.name}</strong>
            <small>{template.employerSignatory.title}</small>
            <small>Dated: {employerSignatureDate ? formatSignatureDate(employerSignatureDate) : formatSignatureDate()}</small>
          </div>
          <div>
            <span>Employee</span>
            <div className="dete-contract-signature-line" />
            <strong>{withPlaceholders(employeeName)}</strong>
            <small>Date signed: ____________________</small>
          </div>
        </section>
      </section>
    </DeteEmploymentContractLetterhead>
  );
}

function formatSignatureDate(value?: string): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

const placeholderPattern = /(\[[^\]]+\])/g;

function withPlaceholders(value: string): ReactNode {
  return value.split(placeholderPattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark className="dete-contract-placeholder" key={index}>{part}</mark>
    ) : (
      part
    )
  );
}
