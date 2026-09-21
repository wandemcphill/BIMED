import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';

describe('superseded contract link recovery', () => {
  it('resolves an old superseded contract token to the current issued contract', async () => {
    const source = await fs.readFile('lib/contract-signature.ts', 'utf8');

    expect(source).toContain("signature.status === 'revoked'");
    expect(source).toContain("signature.revoked_reason === 'Replaced by a newer BIMED contract-signature request.'");
    expect(source).toContain(".eq('application_id', signature.application_id)");
    expect(source).toContain(".eq('doc_type', 'contract')");
    expect(source).toContain(".eq('status', 'issued')");
    expect(source).toContain(".order('issued_at', { ascending: false })");
  });

  it('does not turn other revoked contract links back into active signing links', async () => {
    const source = await fs.readFile('lib/contract-signature.ts', 'utf8');
    expect(source).toContain('return signature;');
  });
});
