import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import { getStaffSessionFromToken, STAFF_SESSION_COOKIE_NAME } from '@/lib/staff-auth';
import { db } from '@/lib/db';
import { applyBimedContractDefaults } from '@/lib/bimed-role-policy';
import { applyContractOverrides, getContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';

export const dynamic = 'force-dynamic';

export default async function StaffEmploymentContractCopyPage() {
  const cookieStore = await cookies();
  const session = await getStaffSessionFromToken(cookieStore.get(STAFF_SESSION_COOKIE_NAME)?.value);
  if (!session) redirect('/staff/login');

  const client = db();
  const { data: staff } = await client
    .from('recruitment_staff')
    .select('id,bimed_id,application_id,full_name,email')
    .eq('id', session.staff_id)
    .maybeSingle();

  if (!staff?.application_id) notFound();

  const { data: signatures, error } = await client
    .from('recruitment_contract_signatures')
    .select('id,role_slug,employee_name,employee_address,start_date,status,signed_name,signed_at,issued_by,issued_at,expires_at,created_at')
    .eq('application_id', staff.application_id)
    .eq('status', 'signed')
    .order('created_at', { ascending: false });

  if (error || !signatures?.length) {
    return (
      <main style={{ minHeight: '100vh', background: '#f4f7fb', color: '#102a43', padding: 28, fontFamily: 'system-ui' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <a href="/staff" style={{ color: '#0f766e', fontWeight: 800 }}>← Staff Portal</a>
          <section style={{ marginTop: 18, background: '#fff', border: '1px solid #e5eaf0', borderRadius: 18, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.2, color: '#0f766e' }}>EMPLOYMENT DOCUMENTS</div>
            <h1 style={{ margin: '6px 0 10px' }}>Signed employment contract</h1>
            <p style={{ color: '#627d98', lineHeight: 1.6 }}>
              Your signed employment contract is not currently available in the Staff Portal. If you have already signed a BIMED employment contract and need another copy, contact the BIMED recruitment or HR team and they can review your document record.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const signature = signatures[0] as any;
  const rawTemplate = getContractTemplate(signature.role_slug);
  if (!rawTemplate) notFound();

  let baseTemplate = rawTemplate;
  try {
    const override = await getDocumentOverride('contract', signature.role_slug);
    baseTemplate = mergeContractTemplate(rawTemplate, override);
  } catch {
    // Use the source-controlled contract template if no override is available.
  }

  const template = applyBimedContractDefaults(
    applyContractOverrides(baseTemplate, {
      employeeName: signature.employee_name,
      employeeAddress: signature.employee_address,
      startDate: signature.start_date,
    })
  );

  const employeeSignatureSlot = (
    <>
      <div className="signature-line signature-line-signed">{signature.signed_name || signature.employee_name}</div>
      <strong>{signature.signed_name || signature.employee_name}</strong>
      <small>Dated: {signature.signed_at ? new Date(signature.signed_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date recorded in BIMED records'}</small>
    </>
  );

  return (
    <main>
      <div style={{ maxWidth: 1100, margin: '20px auto 0', padding: '0 16px' }}>
        <a href="/staff" style={{ color: '#0f766e', fontWeight: 800 }}>← Staff Portal</a>
        <div style={{ marginTop: 12, padding: '12px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, color: '#166534', fontSize: 13, lineHeight: 1.55 }}>
          <strong>Signed contract copy</strong><br />
          This is your signed BIMED employment contract record. Use <strong>Print / Save PDF</strong> on the document to keep a copy for your personal records.
          {signature.signed_at ? <> Signed on {new Date(signature.signed_at).toLocaleDateString('en-IE', { dateStyle: 'long' })}.</> : null}
        </div>
      </div>
      <EmploymentContractDocument
        template={template}
        employeeSignatureSlot={employeeSignatureSlot}
        prefilledFor={{ name: signature.employee_name, email: staff.email }}
        employerSignatureDate={signature.issued_at}
      />
    </main>
  );
}
