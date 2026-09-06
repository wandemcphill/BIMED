import type { Metadata } from 'next';
import PolicyDocument from '@/components/PolicyDocument';
import SignDocumentForm from '@/components/SignDocumentForm';
import { getContractSignatureByToken, type SignableDocType } from '@/lib/contract-signature';
import { employeeHandbookTemplate } from '@/lib/document-templates';
import { resolveJobDescriptionTemplate } from '@/lib/job-description-prefill';
import { getDocumentOverride, mergeDocumentTemplate } from '@/lib/document-overrides';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ docType: string; token: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { docType } = await params;
  const label = docType === 'handbook' ? 'Employee Handbook' : 'Job Description';
  return {
    title: `Bimed Healthcare | Sign Your ${label}`,
    description: `Review and sign your Bimed Healthcare ${label}`,
  };
}

function GateMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="wrap">
      <section className="card gate-card">
        <div className="gate-hero">
          <div>
            <span className="pill">DOCUMENT SIGNING</span>
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

export default async function SignDocumentPage({ params }: PageProps) {
  const { docType: rawDocType, token } = await params;
  const urlDocType = rawDocType === 'handbook' ? 'handbook' : rawDocType === 'job-description' ? 'job-description' : null;
  const docType: SignableDocType | null = urlDocType === 'handbook' ? 'handbook' : urlDocType === 'job-description' ? 'job_description' : null;

  if (!urlDocType || !docType) {
    return <GateMessage title="Link not valid" body="This document signing link is not valid. Please contact the Bimed recruitment team." />;
  }

  let signature;
  try {
    signature = await getContractSignatureByToken(token);
  } catch {
    return (
      <GateMessage
        title="Signing temporarily unavailable"
        body="We could not load this document right now. Please try again shortly, or contact the Bimed recruitment team."
      />
    );
  }

  if (!signature || signature.doc_type !== docType) {
    return <GateMessage title="Link not valid" body="This document signing link is not valid. Please contact the Bimed recruitment team for a new one." />;
  }

  if (signature.status === 'issued' && signature.expires_at && new Date(signature.expires_at).getTime() < Date.now()) {
    return <GateMessage title="Link expired" body="This document signing link has expired. Please contact the Bimed recruitment team to have it reissued." />;
  }

  let template = employeeHandbookTemplate;
  let documentLabel = 'Employee Handbook';

  if (docType === 'job_description') {
    const result = await resolveJobDescriptionTemplate(signature.role_slug, signature.application_id);
    if (result.status === 'not_found') {
      return <GateMessage title="Document unavailable" body="The job description for this role could not be found. Please contact the Bimed recruitment team." />;
    }
    template = result.template;
    documentLabel = `${result.template.roleLabel} Job Description`;
  } else {
    try {
      const override = await getDocumentOverride('handbook', null);
      template = mergeDocumentTemplate(employeeHandbookTemplate, override);
    } catch {
      // Falls back to the code-defined handbook if the override lookup fails.
    }
  }

  const employeeSignatureSlot =
    signature.status === 'signed' ? (
      <>
        <div className="signature-line signature-line-signed">{signature.signed_name}</div>
        <strong>{signature.signed_name}</strong>
        <small>Dated: {signature.signed_at ? new Date(signature.signed_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</small>
      </>
    ) : (
      <SignDocumentForm urlDocType={urlDocType} token={token} documentLabel={documentLabel} />
    );

  return <PolicyDocument template={template} employeeSignatureSlot={employeeSignatureSlot} />;
}
