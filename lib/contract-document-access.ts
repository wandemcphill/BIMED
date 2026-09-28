import { db } from '@/lib/db';
import { hashToken, makeToken } from '@/lib/token';
import { getAppUrl } from '@/lib/email';

export type ContractDocumentAccess = {
  id: string;
  application_id: string;
  signature_id: string | null;
  access_kind: 'signed' | 'unsigned';
  created_by: string;
  created_at: string;
  expires_at: string;
};

export async function createContractDocumentAccess(input: {
  applicationId: string;
  signatureId?: string | null;
  accessKind: 'signed' | 'unsigned';
  createdBy: string;
}) {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from('recruitment_contract_document_access')
    .insert({
      token_hash: hashToken(token),
      application_id: input.applicationId,
      signature_id: input.signatureId || null,
      access_kind: input.accessKind,
      created_by: input.createdBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Unable to create contract document link.');
  return {
    record: data as ContractDocumentAccess,
    token,
    url: `${getAppUrl()}/contract-copy/${token}`,
  };
}

export async function getContractDocumentAccess(token: string) {
  const { data, error } = await db()
    .from('recruitment_contract_document_access')
    .select('*')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  const record = data as ContractDocumentAccess;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}
