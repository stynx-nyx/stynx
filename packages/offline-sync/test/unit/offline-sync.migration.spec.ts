import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../migrations/0001_offline_sync.sql'),
  'utf8',
);

describe('offline-sync migration contract', () => {
  it('defines generic numbering and sync tables without TEAT or AIT names', () => {
    expect(migration).toContain('offline.numbering_ranges');
    expect(migration).toContain('offline.numbering_reservations');
    expect(migration).toContain('offline.sync_queue_items');
    expect(migration).toContain('offline.sync_conflicts');
    expect(migration).toContain('entity_type text NOT NULL');
    expect(migration).not.toMatch(/teat|offline_ait|traffic_agency/iu);
  });

  it('enforces tenant payload-hash idempotency and canonical hashes', () => {
    expect(migration).toContain('UNIQUE (tenant_id, payload_hash)');
    expect(migration).toContain("payload_hash ~ '^sha256:[0-9a-f]{64}$'");
  });

  it('enables and forces RLS on every tenant table', () => {
    for (const table of [
      'numbering_ranges',
      'numbering_reservations',
      'sync_queue_items',
      'sync_conflicts',
    ]) {
      expect(migration).toContain(`ALTER TABLE offline.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE offline.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toMatch(
        new RegExp(
          `CREATE POLICY offline_tenant_isolation ON offline\\.${table}[\\s\\S]*?current_setting\\('app\\.tenant_id'`,
        ),
      );
    }
  });

  it('keeps operational indexes tenant-leading', () => {
    expect(migration).toContain('(tenant_id, device_id, status, received_at)');
    expect(migration).toContain('(tenant_id, entity_type, local_entity_id)');
    expect(migration).toContain('(tenant_id, range_id, start_number, end_number)');
  });
});
