import type { Metadata } from 'next';
import DeteEmploymentContractDocument from '@/components/DeteEmploymentContractDocument';
import DeteContractAccessGate from '@/components/DeteContractAccessGate';
import SignDeteContractForm from '@/components/SignDeteContractForm';
import {
  expireDeteContractSignature,
  getDeteContractSignatureByToken,
} from '@/lib/dete-contract-signature';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BIMED Healthcare | Sign Permit-Stage Employment Contract',
  description: 'Review and sign your BIMED permit-stage employment contract for the Irish employment permit application',
};

type PageProps = { params: Promise<{ token: string }> };

export default async function SignDeteContractPage({ params }: PageProps) {
  const { token } = await params;
  const signature = await getDeteContractSignatureByToken(token);

  if (!signature) return <DeteContractAccessGate reason="not_found" />;

  if (signature.expires_at && new Date(signature.expires_at).getTime() < Date.now() && signature.status === 'issued') {
    await expireDeteContractSignature(signature.id);
    return <DeteContractAccessGate reason="blocked" />;
  }

  if (signature.status === 'revoked' || signature.status === 'expired') {
    return <DeteContractAccessGate reason="blocked" />;
  }

  const template = signature.document_snapshot.template;
  const employeeSignature =
    signature.status === 'signed'
      ? {
          name: signature.employee_signed_name || signature.employee_name,
          date: signature.employee_signed_at,
        }
      : null;

  return (
    <>
      <DeteEmploymentContractDocument
        template={template}
        prefilledFor={{ name: signature.employee_name, email: signature.employee_email }}
        employerSignatureDate={signature.employer_signed_at}
        employeeSignature={employeeSignature}
      />
      {signature.status === 'signed' ? (
        <section className="card" style={{ margin: '18px 16px 28px' }}>
          <strong>Contract signed</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            This permit-stage contract was electronically signed by {signature.employee_signed_name || signature.employee_name} on{' '}
            {formatDate(signature.employee_signed_at)}. The signed record is retained by BIMED with its document snapshot.
          </p>
        </section>
      ) : (
        <section className="card" style={{ margin: '18px 16px 28px' }}>
          <SignDeteContractForm token={token} employeeName={signature.employee_name} />
        </section>
      )}
    </>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'the recorded signing date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-IE', { dateStyle: 'long', timeStyle: 'short' });
}
