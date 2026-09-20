import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getAppUrl } from '@/lib/email';

export type SignableDocType = 'contract' | 'handbook' | 'job_description';

export type ContractSignatureRecord = {
  id: string;
  application_id: string;
  doc_type: SignableDocType;
  role_slug: string;
  employee_name: string;
  employee_address: string | null;
  start_date: string | null;
  status: 'issued' | 'signed' | 'revoked';
  signed_name: string | null;
  signed_at: string | null;
  issued_by: string;
  issued_at: string;
  expires_at: string | null;
  created_at: string;
};

const SIGNING_LINK_TTL_DAYS = 14;

// Contract keeps its own dedicated route (already live, already emailed to candidates) - handbook
// and job description share a generic route since they're new.
export function documentSigningUrl(docType: SignableDocType, token: string): string {
  if (docType === 'contract') return `${getAppUrl()}/sign-contract/${token}`;
  return `${getAppUrl()}/sign-document/${docType === 'handbook' ? 'handbook' : 'job-description'}/${token}`;
}

export function contractSigningUrl(token: string): string {
  return documentSigningUrl('contract', token);
}

export async function createDocumentSignatureRequest(input: {
  applicationId: string;
  docType: SignableDocType;
  roleSlug: string;
  employeeName: string;
  employeeAddress: string | null;
  startDate: string | null;
  issuedBy: string;
}): Promise<{ record: ContractSignatureRecord; token: string; signUrl: string }> {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + SIGNING_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  if (input.docType === 'contract') {
    const { data, error } = await db().rpc('bimed_issue_contract_signature_request', {
      p_application_id: input.applicationId,
      p_role_slug: input.roleSlug,
      p_token_hash: hashToken(token),
      p_employee_name: input.employeeName,
      p_employee_address: input.employeeAddress,
      p_start_date: input.startDate,
      p_issued_by: input.issuedBy,
      p_expires_at: expiresAt,
    });
    if (error || !data) {
      throw new Error(error?.message || 'Unable to create signature request.');
    }
    return { record: data as ContractSignatureRecord, token, signUrl: documentSigningUrl(input.docType, token) };
  }

  const { data, error } = await db()
    .from('recruitment_contract_signatures')
    .insert({
      application_id: input.applicationId,
      doc_type: input.docType,
      role_slug: input.roleSlug,
      token_hash: hashToken(token),
      employee_name: input.employeeName,
      employee_address: input.employeeAddress,
      start_date: input.startDate,
      issued_by: input.issuedBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Unable to create signature request.');

  return { record: data as ContractSignatureRecord, token, signUrl: documentSigningUrl(input.docType, token) };
}

export async function createContractSignatureRequest(input: {
  applicationId: string;
  roleSlug: string;
  employeeName: string;
  employeeAddress: string | null;
  startDate: string | null;
  issuedBy: string;
}): Promise<{ record: ContractSignatureRecord; token: string; signUrl: string }> {
  return createDocumentSignatureRequest({ ...input, docType: 'contract' });
}

export async function getContractSignatureByToken(token: string): Promise<ContractSignatureRecord | null> {
  const { data, error } = await db()
    .from('recruitment_contract_signatures')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  return data as ContractSignatureRecord;
}

export async function listContractSignaturesForApplication(
  applicationId: string,
  docType?: SignableDocType
): Promise<ContractSignatureRecord[]> {
  let query = db()
    .from('recruitment_contract_signatures')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (docType) query = query.eq('doc_type', docType);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as ContractSignatureRecord[];
}

export type SignatureCorrections = {
  employeeName?: string;
  employeeAddress?: string;
  startDate?: string;
};

// Lets the candidate fix a wrong pre-filled detail (name, address, start date) at the point of
// signing, rather than being stuck with whatever the admin entered when issuing the link.
export async function markContractSignatureSigned(
  id: string,
  signedName: string,
  corrections?: SignatureCorrections
): Promise<ContractSignatureRecord | null> {
  const update: Record<string, unknown> = {
    status: 'signed',
    signed_name: signedName,
    signed_at: new Date().toISOString(),
  };

  if (corrections?.employeeName) update.employee_name = corrections.employeeName;
  if (corrections?.employeeAddress !== undefined) update.employee_address = corrections.employeeAddress || null;
  if (corrections?.startDate !== undefined) update.start_date = corrections.startDate || null;

  const { data, error } = await db()
    .from('recruitment_contract_signatures')
    .update(update)
    .eq('id', id)
    .eq('status', 'issued')
    .select('*')
    .maybeSingle();

  if (error || !data) return null;
  return data as ContractSignatureRecord;
}
