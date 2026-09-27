'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { BIMED_LETTERHEAD } from '@/lib/bimed-letterhead';

export default function EmploymentContractLetterhead({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="contract-page">
      <article className="contract-sheet">
        <header className="contract-header">
          <div className="contract-brand">
            <div className="contract-logo-mark">
              <Image
                src="/bimed-logo.png"
                alt={BIMED_LETTERHEAD.legalName}
                width={200}
                height={67}
                priority
              />
            </div>
            <div className="contract-brand-copy">
              <p className="contract-company">{BIMED_LETTERHEAD.legalName}</p>
              <p className="contract-tagline">{BIMED_LETTERHEAD.tagline}</p>
              <p className="contract-registration">Company No. {BIMED_LETTERHEAD.companyNumber} · {BIMED_LETTERHEAD.jurisdiction}</p>
            </div>
          </div>

          <div className="contract-header-side">
            <div className="contract-document-badge">{BIMED_LETTERHEAD.documentLabel}</div>
            <div className="contract-document-compliance">{BIMED_LETTERHEAD.complianceLabel}</div>
            <div className="contract-contact">
              <div>
                <span>Registered office</span>
                <strong>{BIMED_LETTERHEAD.registeredOffice}</strong>
              </div>
              <div>
                <span>Recruitment</span>
                <strong>{BIMED_LETTERHEAD.recruitmentEmail}</strong>
              </div>
              <div>
                <span>Overseas recruitment</span>
                <strong>{BIMED_LETTERHEAD.overseasEmail}</strong>
              </div>
              <div>
                <span>General administration</span>
                <strong>{BIMED_LETTERHEAD.adminEmail}</strong>
              </div>
            </div>
          </div>
        </header>

        <div className="contract-rule" />

        {children}

        <footer className="contract-footer">
          <div>
            <strong>{BIMED_LETTERHEAD.legalName}</strong>
            <span>Company No. {BIMED_LETTERHEAD.companyNumber}</span>
            <span>{BIMED_LETTERHEAD.registeredOffice}</span>
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
