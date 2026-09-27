import type { ReactNode } from 'react';
import Image from 'next/image';
import { BIMED_LETTERHEAD } from '@/lib/bimed-letterhead';

export default function DeteEmploymentContractLetterhead({ children }: { children: ReactNode }) {
  return (
    <div className="dete-contract-page">
      <article className="dete-contract-sheet">
        <header className="dete-contract-header">
          <div className="dete-contract-brand">
            <div className="dete-contract-logo">
              <Image
                src="/bimed-logo.png"
                alt={BIMED_LETTERHEAD.legalName}
                width={210}
                height={70}
                priority
              />
            </div>
            <div className="dete-contract-brand-copy">
              <div className="dete-contract-company">{BIMED_LETTERHEAD.legalName}</div>
              <div className="dete-contract-tagline">{BIMED_LETTERHEAD.tagline}</div>
              <div className="dete-contract-registration">
                Company No. {BIMED_LETTERHEAD.companyNumber} · Republic of Ireland
              </div>
            </div>
          </div>

          <div className="dete-contract-header-side">
            <div className="dete-contract-badge">IRELAND EMPLOYMENT CONTRACT</div>
            <div className="dete-contract-compliance">EMPLOYMENT PERMIT SUPPORTING DOCUMENT</div>
            <div className="dete-contract-contact">
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
                <span>Administration</span>
                <strong>{BIMED_LETTERHEAD.adminEmail}</strong>
              </div>
            </div>
          </div>
        </header>

        <div className="dete-contract-rule" />
        {children}
        <footer className="dete-contract-footer">
          <div>
            <strong>{BIMED_LETTERHEAD.legalName}</strong>
            <span>Company No. {BIMED_LETTERHEAD.companyNumber}</span>
            <span>{BIMED_LETTERHEAD.registeredOffice}</span>
          </div>
          <div>
            <span>{BIMED_LETTERHEAD.website}</span>
            <span>{BIMED_LETTERHEAD.recruitmentEmail}</span>
            <span>{BIMED_LETTERHEAD.overseasEmail}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
