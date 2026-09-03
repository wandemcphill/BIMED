import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import { resolveContractTemplate } from '@/lib/contract-prefill';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Healthcare Assistant Contract Template',
  description: 'Print-ready healthcare assistant contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ applicationId?: string }>;
};

export default async function HealthcareAssistantContractPage({ searchParams }: PageProps) {
  const { applicationId } = await searchParams;
  const result = await resolveContractTemplate('healthcare-assistant', applicationId);

  if (result.status === 'unauthorized' || result.status === 'not_found') {
    return <ContractAccessGate reason={result.status} />;
  }

  return <EmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />;
}
