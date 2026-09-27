import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import { resolveContractTemplate } from '@/lib/contract-prefill';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Physiotherapist Contract Template',
  description: 'Print-ready physiotherapist contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ applicationId?: string }>;
};

export default async function PhysiotherapistContractPage({ searchParams }: PageProps) {
  const { applicationId } = await searchParams;
  const result = await resolveContractTemplate('physiotherapist', applicationId);

  if (result.status === 'unauthorized' || result.status === 'not_found' || result.status === 'blocked') {
    return <ContractAccessGate reason={result.status} />;
  }

  return <EmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />;
}
