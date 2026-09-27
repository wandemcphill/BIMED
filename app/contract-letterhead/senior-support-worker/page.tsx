import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import { resolveContractTemplate } from '@/lib/contract-prefill';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Senior Support Worker Contract Template',
  description: 'Print-ready senior support worker contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ applicationId?: string; staffId?: string }>;
};

export default async function SeniorSupportWorkerContractPage({ searchParams }: PageProps) {
  const { applicationId, staffId } = await searchParams;
  const result = staffId
    ? await resolveStaffContractTemplate(staffId)
    : await resolveContractTemplate('senior-support-worker', applicationId);

  if (result.status === 'unauthorized' || result.status === 'not_found' || result.status === 'blocked') {
    return <ContractAccessGate reason={result.status} />;
  }

  return <EmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />;
}
