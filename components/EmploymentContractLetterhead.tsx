'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';

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
                alt="Bimed Healthcare Limited"
                width={200}
                height={67}
                priority
              />
            </div>
            <div>
              <p className="contract-company">Bimed Healthcare Limited</p>
              <p className="contract-tagline">Love. Care. Comfort.</p>
            </div>
          </div>
          <div className="contract-contact">
            <div>
              <span>Recruitment</span>
              <strong>recruitment@bimedhealthcare.com</strong>
            </div>
            <div>
              <span>Admin</span>
              <strong>info@bimedhealthcare.com</strong>
            </div>
            <div>
              <span>Location</span>
              <strong>Dublin, Ireland</strong>
            </div>
          </div>
        </header>

        <div className="contract-rule" />

        {children}
      </article>
    </div>
  );
}
