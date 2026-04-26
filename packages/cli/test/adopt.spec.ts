import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { adoptApply, adoptScan } from '../src/adopt';

describe('adopt command family', () => {
  it('is idempotent on the fixture repo', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-adopt-fixture-'));
    cpSync(resolve(__dirname, 'fixtures/adoption-fixture'), root, { recursive: true });
    const before = adoptScan(root);
    expect(before.invariants.routePermissions).toHaveLength(4);
    const first = adoptApply(root, false);
    const second = adoptApply(root, false);
    expect(first.changedFiles.length).toBeGreaterThanOrEqual(3);
    expect(second.changedFiles).toHaveLength(0);
    expect(readFileSync(resolve(root, 'src/auth.middleware.ts'), 'utf8')).toContain('DEPRECATED in favor of @stynx/auth');
  });
});
