import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import type { ContractTemplate } from '@/lib/contract-templates';

export type DeteContractSignatureStatus = 'issued' | 'signed' | 'revoked' | 'expired';

export type DeteContractDocumentSnapshot = {
  version: 1;
  template: ContractTemplate;
};

export type DeteContractSignatureRecord = {
  id: string;
  staff_id: string;
  application_id: string;
  role_slug: string;
  bimed_id: string;
  employee_name: string;
  employee_email: string;
  status: DeteContractSignatureStatus;
  document_snapshot: DeteContractDocumentSnapshot;
  employer_signed_name: string;
  employer_signed_at: string;
  employee_signed_name: string | null;
  employee_signed_at: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  issued_by: string;
  issued_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
};

export async function getDeteContractSignatureByToken(token: string): Promise<DeteContractSignatureRecord | null> {
  const { data, error } = await db()
    .from('recruitment_dete_contract_signatures')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  return data as DeteContractSignatureRecord;
}

export async function listDeteContractSignaturesForStaff(staffId: string): Promise<DeteContractSignatureRecord[]> {
  const { data, error } = await db()
    .from('recruitment_dete_contract_signatures')
    .select('*')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as DeteContractSignatureRecord[];
}

export async function getLatestDeteContractSignatureForStaff(staffId: string): Promise<DeteContractSignatureRecord | null> {
  const records = await listDeteContractSignaturesForStaff(staffId);
  return records[0] || null;
}

export async function getSignedDeteContractSignatureForStaff(staffId: string): Promise<DeteContractSignatureRecord | null> {
  const { data, error } = await db()
    .from('recruitment_dete_contract_signatures')
    .select('*')
    .eq('staff_id', staffId)
    .eq('status', 'signed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as DeteContractSignatureRecord;
}

export async function issueDeteContractSignature(input: {
  staffId: string;
  applicationId: string;
  roleSlug: string;
  bimedId: string;
  employeeName: string;
  employeeEmail: string;
  template: ContractTemplate;
  issuedBy: string;
  expiresAt: string;
}): Promise<{ signature: DeteContractSignatureRecord; token: string }> {
  const client = db();
  const now = new Date().toISOString();

  const { error: revokeError } = await client
    .from('recruitment_dete_contract_signatures')
    .update({
      status: 'revoked',
      revoked_at: now,
      revoked_reason: 'Replaced by a newly issued permit-stage contract signing link.',
      updated_at: now,
    })
    .eq('staff_id', input.staffId)
    .eq('status', 'issued');

  if (revokeError) throw revokeError;

  const token = makeToken();
  const { data, error } = await client
    .from('recruitment_dete_contract_signatures')
    .insert({
      staff_id: input.staffId,
      application_id: input.applicationId,
      role_slug: input.roleSlug,
      bimed_id: input.bimedId,
      employee_name: input.employeeName,
      employee_email: input.employeeEmail,
      status: 'issued',
      token_hash: hashToken(token),
      document_snapshot: { version: 1, template: input.template },
      employer_signed_name: input.template.employerSignatory.name,
      employer_signed_at: now,
      issued_by: input.issuedBy,
      issued_at: now,
      expires_at: input.expiresAt,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Unable to create the permit-stage contract signature record.');
  return { signature: data as DeteContractSignatureRecord, token };
}

export async function markDeteContractSignatureSigned(
  id: string,
  signedName: string,
  signedIp: string | null,
  signedUserAgent: string | null,
): Promise<DeteContractSignatureRecord | null> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('recruitment_dete_contract_signatures')
    .update({
      status: 'signed',
      employee_signed_name: signedName,
      employee_signed_at: now,
      signed_ip: signedIp,
      signed_user_agent: signedUserAgent,
      updated_at: now,
    })
    .eq('id', id)
    .eq('status', 'issued')
    .select('*')
    .maybeSingle();

  if (error || !data) return null;
  return data as DeteContractSignatureRecord;
}

export async function expireDeteContractSignature(id: string): Promise<void> {
  await db()
    .from('recruitment_dete_contract_signatures')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'issued');
}
