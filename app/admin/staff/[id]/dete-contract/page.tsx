import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BimedDeteContractDocument from '@/components/BimedDeteContractDocument';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BIMED Healthcare | DETE Employment Permit Contract',
  description: 'Permit-stage employment contract for the Irish employment permit application',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function BimedDeteContractPage({ params }: PageProps) {
  const { id } = await params;
  const result = await resolveStaffContractTemplate(id);

  if (result.status === 'unauthorized') {
    return (
      <main className="wrap">
        <section className="card gate-card">
          <span className="pill">DETE PERMIT CONTRACT</span>
          <h1>Admin sign-in required</h1>
          <p className="muted">
            This document contains private employee, accommodation and travel information. Sign in to the BIMED admin dashboard before opening it.
          </p>
          <a className="primary link-button" href="/admin">Go to admin dashboard</a>
        </section>
      </main>
    );
  }

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'blocked') {
    return (
      <main className="wrap">
        <section className="card gate-card">
          <span className="pill">DETE PERMIT CONTRACT</span>
          <h1>Not ready for permit-stage issue</h1>
          <p className="muted">{result.reason}</p>
          <div className="gate-note">
            <strong>Required sequence</strong>
            <p>
              The initial BIMED onboarding contract must already be complete, then the applicable accommodation
              route must be confirmed and the overseas travel itinerary recorded before this permit-stage document
              is opened for signature.
            </p>
          </div>
          <a className="secondary link-button" href="/admin/staff">Return to workforce staff</a>
        </section>
      </main>
    );
  }

  return (
    <BimedDeteContractDocument
      template={result.template}
      context={result.context}
    />
  );
}
