import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderOfflineStorage, renderOfflineStorageMigrations } from '../../src/storage.js';

const sources = [
  '0001_offline_sync.sql',
  '0002_durable_sync.sql',
  '0003_reservation_idempotency.sql',
  '0004_pending_state_and_conflict_actions.sql',
  '0005_initial_queue_status.sql',
  '0006_nullable_active_reservations.sql',
  '0007_range_administration.sql',
  '0008_import_receipts.sql',
  '0009_numbering_reconciliations.sql',
];
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

// INV-OFFLINE-001: forward source identity and bound output identity remain separate.
describe('Ordered consumer-owned offline migration artifacts', () => {
  it.each([
    {},
    {
      ownerRole: 'proprietário',
      appRole: 'aplicação',
      readerRole: 'leitor',
      tenantTable: { schema: 'autenticação', table: 'locatários', column: 'identidade' },
    },
    {
      ownerRole: 'consumer_owner',
      appRole: 'consumer_app',
      readerRole: null,
      tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
    },
  ])('binds every original source and exact ordered output for %j', (options) => {
    const artifact = renderOfflineStorageMigrations(options);
    const fresh = renderOfflineStorage(options);
    expect(renderOfflineStorageMigrations(options)).toEqual(artifact);
    expect(artifact.binding).toEqual(fresh.binding);
    expect(artifact.contractVersion).toBe(fresh.contractVersion);
    expect(artifact.packageVersion).toBe(fresh.packageVersion);
    expect(artifact.migrations.map((migration) => migration.source.path)).toEqual(
      sources.map((name) => `packages/offline-sync/migrations/${name}`),
    );
    expect(artifact.migrations.map((migration) => migration.source)).toEqual(
      fresh.manifest.sources.filter((source) =>
        source.path.startsWith('packages/offline-sync/migrations/'),
      ),
    );
    for (const migration of artifact.migrations) {
      expect(migration.source.sha256).toBe(
        sha(readFileSync(resolve(__dirname, '../../../..', migration.source.path))),
      );
      expect(migration.sqlSha256).toBe(sha(Buffer.from(migration.sql, 'utf8')));
      expect(migration.sql).toMatch(/\n$/u);
      expect(migration.sql).not.toMatch(/FOR ALL\s+USING/iu);
      if (artifact.binding.readerRole === null) expect(migration.sql).not.toContain('stynx_reader');
    }
    expect(artifact.migrations[0]!.sql).toContain(
      `REFERENCES "${artifact.binding.tenantTable.schema}"."${artifact.binding.tenantTable.table}"("${artifact.binding.tenantTable.column}")`,
    );
    // The historical backfill must precede grants and later schema changes.
    const durable = artifact.migrations[1]!.sql;
    expect(durable.indexOf('CREATE TABLE offline.sync_batches')).toBeLessThan(
      durable.indexOf('INSERT INTO offline.sync_batches'),
    );
    expect(durable.indexOf('INSERT INTO offline.sync_batches')).toBeLessThan(
      durable.indexOf('INSERT INTO offline.sync_item_receipts'),
    );
    expect(durable.indexOf('INSERT INTO offline.sync_item_receipts')).toBeLessThan(
      durable.indexOf('ALTER TABLE offline.sync_batches ENABLE ROW LEVEL SECURITY'),
    );
    expect(artifact.migrations[5]!.sql.indexOf('DO $upgrade$')).toBeLessThan(
      artifact.migrations[5]!.sql.indexOf(
        'ALTER TABLE offline.numbering_reservations ALTER COLUMN',
      ),
    );
  });

  it('changes bound output digests without changing immutable source identities', () => {
    const original = renderOfflineStorageMigrations();
    const custom = renderOfflineStorageMigrations({ appRole: 'other_app', readerRole: null });
    expect(custom.migrations.map((migration) => migration.source)).toEqual(
      original.migrations.map((migration) => migration.source),
    );
    expect(custom.migrations.map((migration) => migration.sqlSha256)).not.toEqual(
      original.migrations.map((migration) => migration.sqlSha256),
    );
    custom.migrations[0]!.source.path = 'caller-modified';
    expect(renderOfflineStorageMigrations().migrations[0]!.source.path).toBe(
      'packages/offline-sync/migrations/0001_offline_sync.sql',
    );
  });

  it.each([
    { ledger: [] },
    { appRole: 'app; DROP SCHEMA offline' },
    { ownerRole: 'same', appRole: 'same' },
  ])(
    'refuses unsupported selection/unsafe bindings rather than admitting a ledger: %j',
    (options) => expect(() => renderOfflineStorageMigrations(options as never)).toThrow(),
  );
});
