import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderOfflineStorage, verifyOfflineStorage } from '../../src/storage';
import { OFFLINE_STORAGE_TEMPLATE } from '../../src/storage-template.generated';

const relations = [
  'numbering_ranges',
  'numbering_reservations',
  'sync_queue_items',
  'sync_conflicts',
  'sync_batches',
  'sync_batch_transport_keys',
  'sync_item_receipts',
  'sync_item_attempts',
  'numbering_consumption',
  'sync_conflict_evidence',
  'sync_conflict_actions',
  'numbering_reservation_scopes',
  'sync_import_receipts',
];

describe('D6 offline storage artifact and fail-closed verifier admission', () => {
  it('ships the complete offline population and actual digest-bound migration sources', () => {
    const artifact = renderOfflineStorage();
    expect(renderOfflineStorage()).toEqual(artifact);
    expect(artifact.binding).toEqual({
      ownerRole: 'stynx_owner',
      appRole: 'stynx_app',
      readerRole: 'stynx_reader',
      tenantTable: { schema: 'tenancy', table: 'tenants', column: 'id' },
    });
    expect(artifact.contractVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(artifact.packageVersion).toBe(
      JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')).version,
    );
    expect(artifact.manifest.contractVersion).toBe(artifact.contractVersion);
    expect(artifact.manifest.packageVersion).toBe(artifact.packageVersion);
    expect(
      artifact.manifest.catalog
        .filter((entry) => entry.kind === 'relation')
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([...relations].sort());
    for (const source of artifact.manifest.sources) {
      expect(
        createHash('sha256')
          .update(readFileSync(resolve(__dirname, '../../../..', source.path)))
          .digest('hex'),
      ).toBe(source.sha256);
    }
    for (const source of OFFLINE_STORAGE_TEMPLATE.sources) {
      expect(artifact.manifest.sources).toContainEqual(source);
    }
    expect(artifact.objectsSql).not.toMatch(/\baudit\s*\./iu);
    expect(artifact.manifest.dependencies.join(' ')).toMatch(/READ COMMITTED/u);
    expect(artifact.manifest.dependencies.join(' ')).toMatch(/ACCESS EXCLUSIVE/u);
    expect(artifact.roleBindingsSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)\b/iu);
  });

  it('renders tenant and role bindings with no optional-reader capability or surviving PUBLIC tenant policy', () => {
    const artifact = renderOfflineStorage({
      ownerRole: 'consumer_owner',
      appRole: 'role_app_backend',
      readerRole: null,
      tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
    });
    expect(artifact.objectsSql).toContain('"auth"."tenants"("tenant_uuid")');
    expect(artifact.objectsSql).not.toMatch(/\btenancy\s*\./iu);
    expect(artifact.roleBindingsSql).not.toContain('stynx_reader');
    expect(artifact.roleBindingsSql).toContain('DROP POLICY IF EXISTS offline_tenant_isolation');
    const policies = artifact.manifest.catalog.filter((entry) => entry.kind === 'policy');
    expect(policies.length).toBeGreaterThan(0);
    for (const entry of policies) {
      expect(entry.value.roles).not.toContain('PUBLIC');
      expect(entry.value.roles).not.toContain('stynx_reader');
    }
    expect(
      artifact.manifest.catalog
        .filter((entry) => entry.kind === 'grant')
        .some(
          (entry) =>
            entry.value.object === 'sync_import_receipts' &&
            ['role_app_backend', 'PUBLIC'].includes(entry.value.grantee as string),
        ),
    ).toBe(false);
  });

  it('refuses malformed and unknown binding options before invoking a connection', async () => {
    const query = vi.fn();
    for (const options of [
      { appRole: 'app;drop schema offline' },
      { readerRole: 'reader\0invalid' },
      { arbitrarySql: 'select 1' },
      { ownerRole: 'same', appRole: 'same' },
    ]) {
      expect(() =>
        renderOfflineStorage(options as Parameters<typeof renderOfflineStorage>[0]),
      ).toThrow();
      expect(() =>
        verifyOfflineStorage({ query }, options as Parameters<typeof renderOfflineStorage>[0]),
      ).toThrow();
    }
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { owner: 'stynx_app', readonly: 'on', check: 'transaction-owner' },
    { owner: 'stynx_owner', readonly: 'off', check: 'transaction-read-only' },
  ])(
    'refuses the wrong owner/read-only boundary without catalog or data access: %j',
    async ({ owner, readonly, check }) => {
      const query = vi.fn().mockResolvedValue({ rows: [{ owner, readonly }] });
      const report = await verifyOfflineStorage({ query });
      expect(report.supported).toBe(false);
      expect(report.checks).toContainEqual(expect.objectContaining({ id: check, status: 'fail' }));
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it('reports unreadable admission as unknown without leaking database errors', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('password=private source-payload'), { code: '42501' }),
      );
    const report = await verifyOfflineStorage({ query });
    expect(report.supported).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ id: 'verification-unavailable', status: 'unknown' }),
    );
    expect(JSON.stringify(report)).not.toMatch(/private|source-payload/u);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

it('customizes the reader independently while preserving the default app policy identity', () => {
  const artifact = renderOfflineStorage({ readerRole: 'consumer_reader' });
  expect(artifact.binding.appRole).toBe('stynx_app');
  expect(artifact.binding.readerRole).toBe('consumer_reader');
  expect(artifact.roleBindingsSql).toContain('"consumer_reader"');
  expect(
    artifact.manifest.catalog.filter((entry) => entry.kind === 'policy').map((entry) => entry.name),
  ).toEqual(expect.arrayContaining([expect.stringMatching(/__[a-f0-9]{12}$/)]));
});
it.each([null, 'not-an-error', { code: 'private_error_detail' }, { code: 42 }])(
  'sanitizes arbitrary unavailable verifier errors: %j',
  async (failure) => {
    const query = vi.fn().mockRejectedValue(failure);
    const report = await verifyOfflineStorage({ query });
    expect(report.supported).toBe(false);
    expect(report.checks).toEqual([
      expect.objectContaining({
        id: 'verification-unavailable',
        status: 'unknown',
        reason: 'Catalog or invariant verification unavailable',
      }),
    ]);
    expect(JSON.stringify(report)).not.toContain('private_error_detail');
  },
);
