import Image from 'next/image';
import type { ReactNode } from 'react';
import type { ContractTemplate } from '@/lib/contract-templates';
import type { BimedStaffContractContext } from '@/lib/bimed-staff-contract';
import { BIMED_LETTERHEAD } from '@/lib/bimed-letterhead';
import PrintContractButton from '@/components/PrintContractButton';

export default function BimedDeteContractDocument({
  template,
  context,
}: {
  template: ContractTemplate;
  context: BimedStaffContractContext;
}) {
  return (
    <div className="dete-contract-page">
      <article className="dete-contract-sheet">
        <header className="dete-letterhead">
          <div className="dete-letterhead-brand">
            <Image
              src="/bimed-logo.png"
              alt={BIMED_LETTERHEAD.legalName}
              width={210}
              height={70}
              priority
            />
            <div>
              <div className="dete-company-name">{BIMED_LETTERHEAD.legalName}</div>
              <div className="dete-tagline">{BIMED_LETTERHEAD.tagline}</div>
              <div className="dete-company-meta">
                Company No. {BIMED_LETTERHEAD.companyNumber} · Republic of Ireland
              </div>
            </div>
          </div>

          <div className="dete-letterhead-right">
            <div className="dete-badge">{BIMED_LETTERHEAD.documentLabel}</div>
            <div className="dete-compliance">{BIMED_LETTERHEAD.complianceLabel}</div>
            <div className="dete-contact-block">
              <span>Principal office</span>
              <strong>{BIMED_LETTERHEAD.principalOffice}</strong>
              <span>Recruitment</span>
              <strong>{BIMED_LETTERHEAD.recruitmentEmail}</strong>
              <span>Overseas recruitment</span>
              <strong>{BIMED_LETTERHEAD.overseasEmail}</strong>
            </div>
          </div>
        </header>

        <div className="dete-rule" />

        <div className="dete-toolbar">
          <div>
            <span className="dete-pill">PERMIT-STAGE DOCUMENT</span>
            <div className="dete-toolbar-note">
              Final employment contract prepared for the DETE Employment Permits Online application stage
            </div>
          </div>
          <PrintContractButton />
        </div>

        <section className="dete-title-block">
          <div>
            <h1>{context.roleLabel} Employment Contract</h1>
            <p>
              This document records the employment particulars for the permit stage of the overseas recruitment
              process and is to be signed by the employer and employee before submission where required.
            </p>
          </div>
          <div className="dete-document-ref">
            <span>Employee</span>
            <strong>{context.employeeName}</strong>
            <span>BIMED ID</span>
            <strong>{context.bimedId}</strong>
            <span>Prepared</span>
            <strong>{template.effectiveDate.replace(/^Prepared\\s+/i, '')}</strong>
          </div>
        </section>

        <section className="dete-facts">
          <Fact label="Place of Primary Assignment" value={context.primaryAssignment} />
          <Fact label="Accommodation route" value={context.accommodationRoute} />
          <Fact label="Departure airport" value={context.departureAirport} />
          <Fact label="Final airport in Ireland" value={context.arrivalAirport} />
          <Fact label="Travelling party" value={context.travellingParty} />
          <Fact label="Airport pickup" value={context.airportPickup} />
        </section>

        <section className="dete-panel">
          <SectionKicker>EMPLOYMENT & PERMIT PARTICULARS</SectionKicker>
          <div className="dete-field-grid">
            {template.editableFields.map((field) => (
              <div className="dete-field" key={field.label}>
                <span>{field.label}</span>
                <strong>{renderValue(field.value)}</strong>
                {field.note ? <small>{renderValue(field.note)}</small> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="dete-panel dete-contract-notice">
          <SectionKicker>DOCUMENT STATUS</SectionKicker>
          <p>
            This permit-stage contract is generated from the canonical BIMED Staff Portal employment record and
            linked overseas recruitment records. Employment dates, position, primary assignment, accommodation
            pathway and travel particulars should be checked against the current portal record immediately before
            signature and submission.
          </p>
          <p>
            The initial BIMED recruitment contract issued with the Job Description and Employee Handbook remains a
            separate recruitment/onboarding document. This permit-stage document is the later final employment record
            prepared for the employment-permit process.
          </p>
        </section>

        {template.sections.map((section) => (
          <ContractSection key={section.heading} heading={section.heading} paragraphs={section.paragraphs} bullets={section.bullets} />
        ))}

        <section className="dete-panel">
          <SectionKicker>CONTRACT SCHEDULES</SectionKicker>
          <div className="dete-schedule-list">
            {template.schedules.map((schedule) => (
              <section key={schedule.heading} className="dete-schedule">
                <h3>{schedule.heading}</h3>
                {schedule.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{renderValue(paragraph)}</p>
                ))}
                {schedule.bullets ? (
                  <ul>
                    {schedule.bullets.map((bullet) => <li key={bullet}>{renderValue(bullet)}</li>)}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </section>

        <section className="dete-panel">
          <SectionKicker>SIGNATURES</SectionKicker>
          <p>{renderValue(template.closingNote)}</p>
          <div className="dete-signature-grid">
            <SignatureBox
              caption="For Bimed Healthcare Limited"
              name={template.employerSignatory.name}
              title={template.employerSignatory.title}
            />
            <SignatureBox
              caption="Employee"
              name={context.employeeName}
              title="Signature"
            />
          </div>
        </section>

        <footer className="dete-footer">
          <div>
            <strong>{BIMED_LETTERHEAD.legalName}</strong>
            <span>Company No. {BIMED_LETTERHEAD.companyNumber}</span>
            <span>{BIMED_LETTERHEAD.principalOffice}</span>
          </div>
          <div>
            <span>{BIMED_LETTERHEAD.website}</span>
            <span>{BIMED_LETTERHEAD.recruitmentEmail}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="dete-fact">
      <span>{label}</span>
      <strong>{value || 'To be confirmed'}</strong>
    </div>
  );
}

function SectionKicker({ children }: { children: ReactNode }) {
  return <div className="dete-section-kicker">{children}</div>;
}

function ContractSection({
  heading,
  paragraphs,
  bullets,
}: {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}) {
  return (
    <section className="dete-panel dete-contract-section">
      <h2>{heading}</h2>
      {paragraphs.map((paragraph) => <p key={paragraph}>{renderValue(paragraph)}</p>)}
      {bullets ? (
        <ul>
          {bullets.map((bullet) => <li key={bullet}>{renderValue(bullet)}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function SignatureBox({
  caption,
  name,
  title,
}: {
  caption: string;
  name: string;
  title: string;
}) {
  return (
    <div className="dete-signature-box">
      <span>{caption}</span>
      <div className="dete-signature-line" />
      <strong>{name}</strong>
      <small>{title}</small>
      <small>Date: ______________________________</small>
    </div>
  );
}

const placeholderPattern = /(\\[[^\\]]+\\])/g;

function renderValue(value: string): ReactNode[] {
  return value.split(placeholderPattern).map((part, index) =>
    index % 2 === 1
      ? <mark className="dete-placeholder" key={index}>{part}</mark>
      : part
  );
}
