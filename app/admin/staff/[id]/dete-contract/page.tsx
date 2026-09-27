import type { Metadata } from 'next';
import DeteEmploymentContractDocument from '@/components/DeteEmploymentContractDocument';
import DeteContractAccessGate from '@/components/DeteContractAccessGate';
import DetePermitContractIssueActions from '@/components/DetePermitContractIssueActions';
import { resolveStaffContractTemplate } from '@/lib/bimed-staff-contract';
import { getLatestDeteContractSignatureForStaff } from '@/lib/dete-contract-signature';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BIMED Healthcare | DETE Employment Permit Contract',
  description: 'Permit-stage employment contract for the Irish employment permit application',
};

type PageProps = { params: Promise<{ id: string }> };

export default async function DetePermitStageContractPage({ params }: PageProps) {
  const { id } = await params;
  const result = await resolveStaffContractTemplate(id);

  if (result.status === 'unauthorized' || result.status === 'not_found' || result.status === 'blocked') {
    return <DeteContractAccessGate reason={result.status} />;
  }

  const signature = await getLatestDeteContractSignatureForStaff(id);
  const issuedTemplate = signature?.document_snapshot?.template;

  return (
    <>
      <DetePermitContractIssueActions
        staffId={id}
        status={signature?.status || null}
        signedName={signature?.employee_signed_name}
        signedAt={signature?.employee_signed_at}
        issuedAt={signature?.issued_at}
      />
      <DeteEmploymentContractDocument
        template={issuedTemplate || result.template}
        prefilledFor={result.prefilledFor}
        employerSignatureDate={signature?.employer_signed_at || null}
        employeeSignature={
          signature?.status === 'signed'
            ? {
                name: signature.employee_signed_name || result.context.employeeName,
                date: signature.employee_signed_at,
              }
            : null
        }
      />
    </>
  );
}
