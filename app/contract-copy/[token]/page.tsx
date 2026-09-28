import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import ContractAccessGate from '@/components/ContractAccessGate';
import { getContractDocumentAccess } from '@/lib/contract-document-access';
import { db } from '@/lib/db';
import { getContractTemplate, applyContractOverrides } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { applyBimedContractDefaults, BIMED_DEFAULT_START_DATE_ISO } from '@/lib/bimed-role-policy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Employment Contract Copy',
  description: 'Bimed Healthcare employment contract copy',
};

export default async function ContractCopyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = await getContractDocumentAccess(token);

  if (!access) {
    return <ContractAccessGate reason="not_found" />;
  }

  const client = db();
  const { data: application } = await client
    .from('recruitment_applications')
    .select('id, full_name, email, role_applied')
    .eq('id', access.application_id)
    .maybeSingle();

  if (!application) return <ContractAccessGate reason="not_found" />;

  const signature = access.signature_id
    ? (await client.from('recruitment_contract_signatures').select('*').eq('id', access.signature_id).maybeSingle()).data
    : null;

  const roleSlug = signature?.role_slug || (() => {
    const role = application.role_applied?.toLowerCase() || '';
    if (role.includes('physiotherapist')) return 'physiotherapist';
    if (role.includes('senior support')) return 'senior-support-worker';
    if (role.includes('support worker')) return 'support-worker';
    return 'healthcare-assistant';
  })();

  const raw = getContractTemplate(roleSlug);
  if (!raw) return <ContractAccessGate reason="not_found" />;

  let base = raw;
  try {
    base = mergeContractTemplate(raw, await getDocumentOverride('contract', roleSlug));
  } catch {}

  const template = applyBimedContractDefaults(
    applyContractOverrides(base, {
      employeeName: signature?.employee_name || application.full_name,
      employeeAddress: signature?.employee_address || null,
      employeeAddressStatus: signature?.employee_address
        ? 'Verified Irish residential address included.'
        : 'No Irish residential address included.',
      startDate: signature?.start_date || BIMED_DEFAULT_START_DATE_ISO,
    })
  );

  const employeeSignatureSlot = access.access_kind === 'signed' && signature?.status === 'signed'
    ? (
      <>
        <div className="signature-line signature-line-signed">{signature.signed_name}</div>
        <strong>{signature.signed_name}</strong>
        <small>Dated: {signature.signed_at ? new Date(signature.signed_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small>
      </>
    )
    : undefined;

  return <EmploymentContractDocument
    template={template}
    prefilledFor={{ name: application.full_name, email: application.email }}
    employerSignatureDate={signature?.issued_at || null}
    employeeSignatureSlot={employeeSignatureSlot}
  />;
}
