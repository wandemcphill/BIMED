import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import DeteEmploymentContractDocument from '@/components/DeteEmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import DeteContractAccessGate from '@/components/DeteContractAccessGate';
import { resolveContractTemplate } from '@/lib/contract-prefill';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Healthcare Assistant Contract Template',
  description: 'Print-ready healthcare assistant contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ applicationId?: string; staffId?: string }>;
};

export default async function HealthcareAssistantContractPage({ searchParams }: PageProps) {
  const { applicationId, staffId } = await searchParams;
  const result = staffId
    ? await resolveStaffContractTemplate(staffId)
    : await resolveContractTemplate('healthcare-assistant', applicationId);

  if (result.status === 'unauthorized' || result.status === 'not_found' || result.status === 'blocked') {
    return staffId
      ? <DeteContractAccessGate reason={result.status} />
      : <ContractAccessGate reason={result.status} />;
  }

  return staffId
    ? <DeteEmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />
    : <EmploymentContractDocument template={result.template} prefilledFor={result.prefilledFor} />;
}
