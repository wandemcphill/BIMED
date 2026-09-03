import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import { getContractTemplate } from '@/lib/contract-templates';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Support Worker Contract Template',
  description: 'Print-ready support worker contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

export default function SupportWorkerContractPage() {
  const template = getContractTemplate('support-worker');
  if (!template) {
    return null;
  }

  return <EmploymentContractDocument template={template} />;
}
