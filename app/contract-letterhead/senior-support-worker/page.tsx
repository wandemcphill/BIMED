import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import { getContractTemplate } from '@/lib/contract-templates';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Senior Support Worker Contract Template',
  description: 'Print-ready senior support worker contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

export default function SeniorSupportWorkerContractPage() {
  const template = getContractTemplate('senior-support-worker');
  if (!template) {
    return null;
  }

  return <EmploymentContractDocument template={template} />;
}
