import type { Metadata } from 'next';
import DeteEmploymentContractDocument from '@/components/DeteEmploymentContractDocument';
import DeteContractAccessGate from '@/components/DeteContractAccessGate';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BIMED Healthcare | DETE Employment Permit Contract',
  description: 'Permit-stage employment contract for the Irish employment permit application',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DetePermitStageContractPage({ params }: PageProps) {
  const { id } = await params;
  const result = await resolveStaffContractTemplate(id);

  if (result.status === 'unauthorized' || result.status === 'not_found' || result.status === 'blocked') {
    return <DeteContractAccessGate reason={result.status} />;
  }

  return (
    <DeteEmploymentContractDocument
      template={result.template}
      prefilledFor={result.prefilledFor}
    />
  );
}
