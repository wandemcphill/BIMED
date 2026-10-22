import type { Metadata } from 'next';
import EmploymentContractDocument from '@/components/EmploymentContractDocument';
import SignContractForm from '@/components/SignContractForm';
import { getContractSignatureByToken } from '@/lib/contract-signature';
import { applyContractOverrides, getContractTemplate } from '@/lib/contract-templates';
import { getDocumentOverride, mergeContractTemplate } from '@/lib/document-overrides';
import { applyBimedContractDefaults, BIMED_DEFAULT_START_DATE_ISO, recruitmentRoleSlug } from '@/lib/bimed-role-policy';
import { db } from '@/lib/db';
import { getSocClassification, isAdultAtEmploymentStart } from '@/lib/soc-classification';

export const metadata: Metadata = {
  title: 'Bimed Healthcare | Sign Your Employment Contract',
  description: 'Review and sign your Bimed Healthcare employment contract',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string }>;
};

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">EMPLOYMENT CONTRACT</span>
            <h1>{title}</h1>
            <p className="muted">{body}</p>
          </div>
          <div className="gate-note">
            <strong>Need help?</strong>
            <p>Contact the Bimed Healthcare recruitment team if you believe this is a mistake.</p>
            <div className="gate-contact">
              <span>Recruitment support</span>
              <strong>recruitment@bimedhealthcare.com</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function SignContractPage({ params }: PageProps) {
  const { token } = await params;

  let signature;
  try {
    signature = await getContractSignatureByToken(token);
  } catch {
    return (
      <GateMessage
        title="Signing temporarily unavailable"
        body="We could not load your contract right now. Please try again shortly, or contact the Bimed recruitment team."
      />
    );
  }

  if (!signature) {
    return <GateMessage title="Link not valid" body="This contract signing link is not valid. Please contact the Bimed recruitment team for a new one." />;
  }

  if (signature.status === 'issued' && signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
    return <GateMessage title="Link expired" body="This contract signing link has expired. Please contact the Bimed recruitment team to have it reissued." />;
  }

  let application;
  try {
    const { data, error } = await db()
      .from('recruitment_applications')
      .select('id,full_name,email,date_of_birth,nationality,role_applied')
      .eq('id', signature.application_id)
      .maybeSingle();
    if (error || !data) {
      return <GateMessage title="Application details unavailable" body="We could not retrieve the applicant's source details needed for this contract. Please contact the Bimed recruitment team." />;
    }
    application = data;
  } catch {
    return <GateMessage title="Application details unavailable" body="We could not retrieve the applicant's source details needed for this contract. Please contact the Bimed recruitment team." />;
  }

  if (!String(application.nationality || '').trim()) {
    return <GateMessage title="Contract details incomplete" body="Nationality is missing from the recruitment application. The contract cannot be signed until the application record is completed." />;
  }
  if (!application.date_of_birth) {
    return <GateMessage title="Contract details incomplete" body="Date of birth is missing from the recruitment application. The contract cannot be signed until the application record is completed." />;
  }
  if (!isAdultAtEmploymentStart(application.date_of_birth, signature.start_date || BIMED_DEFAULT_START_DATE_ISO)) {
    return <GateMessage title="Contract requires correction" body="The date of birth in the recruitment application appears invalid or would make the candidate under 18 on the planned employment start date. Please contact Bimed recruitment to verify the application against an identity document before signing." />;
  }
  if (recruitmentRoleSlug(application.role_applied) !== signature.role_slug) {
    return <GateMessage title="Contract role mismatch" body="The contract role does not match the role recorded in your recruitment application. Please contact Bimed recruitment before signing." />;
  }
  const socClassification = getSocClassification(application.role_applied);
  if (!socClassification) {
    return <GateMessage title="Occupation classification unavailable" body="Bimed recruitment must confirm the SOC occupation classification for your role before this contract can be signed." />;
  }

  const rawTemplate = getContractTemplate(signature.role_slug);
  if (!rawTemplate) {
    return <GateMessage title="Contract unavailable" body="The contract for this role could not be found. Please contact the Bimed recruitment team." />;
  }

  let baseTemplate = rawTemplate;
  try {
    const contentOverride = await getDocumentOverride('contract', signature.role_slug);
    baseTemplate = mergeContractTemplate(rawTemplate, contentOverride);
  } catch {
    // Fall back to the code-defined template if the override lookup fails.
  }

  const template = applyBimedContractDefaults(
    applyContractOverrides(baseTemplate, {
      employeeName: signature.employee_name,
      dateOfBirth: new Date(application.date_of_birth + 'T12:00:00Z').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }),
      nationality: String(application.nationality).trim(),
      socClassification: socClassification.display,
      socClassificationNote: socClassification.note + ' Source: ' + socClassification.sourceUrl,
      employeeAddress: signature.employee_address,
      employeeAddressStatus: signature.employee_address
        ? 'Verified Irish residential address included.'
        : 'No Irish residential address included.',
      startDate: signature.start_date,
    })
  );

  const employeeSignatureSlot =
    signature.status === 'signed' ? (
      <>
        <div className="signature-line signature-line-signed">{signature.signed_name}</div>
        <strong>{signature.signed_name}</strong>
        <small>Dated: {signature.signed_at ? new Date(signature.signed_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small>
      </>
    ) : (
      <SignContractForm
        token={token}
        employeeName={signature.employee_name}
        employeeAddress={signature.employee_address || ''}
        startDate={signature.start_date || BIMED_DEFAULT_START_DATE_ISO}
      />
    );

  return <EmploymentContractDocument template={template} employeeSignatureSlot={employeeSignatureSlot} />;
}
