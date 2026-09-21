import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('production release readiness guard', () => {
  it('health endpoint fails closed on schema-readiness failure', () => {
    const route = readFileSync('app/api/health/route.ts', 'utf8');
    expect(route).toContain("client.rpc('bimed_release_readiness_check')");
    expect(route).toContain('status: 503');
    expect(route).toContain("ok: false");
  });

  it('Render uses the release schema gate before deployment', () => {
    const blueprint = readFileSync('render.yaml', 'utf8');
    expect(blueprint).toContain('preDeployCommand: npm run verify:release-schema');
  });

  it('the release schema check calls the canonical readiness RPC', () => {
    const script = readFileSync('scripts/verify-release-schema.mjs', 'utf8');
    expect(script).toContain("client.rpc('bimed_release_readiness_check')");
    expect(script).toContain('process.exit(1)');
  });
});
