import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import { resolveContractTemplate } from '@/lib/contract-prefill';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Senior Support Worker Contract Template',
  description: 'Print-ready senior support worker contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ applicationId?: string }>;
};

export default async function SeniorSupportWorkerContractPage({ searchParams }: PageProps) {
  const { applicationId } = await searchParams;
  const result = await resolveContractTemplate('senior-support-worker', applicationId);

  if (result.status === 'unauthorized' || result.status === 'not_found') {
    return <ContractAccessGate reason={result.status} />;
  }

  return <EmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />;
}
