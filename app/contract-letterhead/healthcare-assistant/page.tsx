import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import { getContractTemplate } from '@/lib/contract-templates';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Healthcare Assistant Contract Template',
  description: 'Print-ready healthcare assistant contract template for Bimed Healthcare',
};

export const dynamic = 'force-dynamic';

export default function HealthcareAssistantContractPage() {
  const template = getContractTemplate('healthcare-assistant');
  if (!template) {
    return null;
  }

  return <EmploymentContractDocument template={template} />;
}
