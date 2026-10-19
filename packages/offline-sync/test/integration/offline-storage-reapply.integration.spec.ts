import { describe, expect, it } from 'vitest';
import { collectStorageCatalog } from '@stynx-nyx/data';
import { renderOfflineStorage } from '../../src/storage.js';
import { importOfflineState } from '../../src/import-state.js';
import { fixture, dispose, baseline } from '../support/offline-storage-fixture.js';
import { reconciliationImportManifest } from '../support/offline-reconciliation-import-fixture.js';

// INV-OFFLINE-001: objects are fresh-only; binding repeats preserve data and archive effects.
describe('Rendered offline storage fresh-install and role-binding boundaries', () => {
  for (const populated of [false, true])
    it(`refuses full installation replay atomically and repeats role bindings with populated=${populated}`, async () => {
      const value = await fixture();
      try {
        await baseline(value);
        if (populated) {
          await value.admin.query('begin');
          await value.admin.query(
            `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
          );
          const receipt = await importOfflineState(
            value.admin,
            reconciliationImportManifest(value.tenants[0]),
            { storage: value.options },
          );
          expect(receipt.recordCounts.reconciliations).toBe(1);
          await value.admin.query('commit');
          await baseline(value);
        }
        const snapshot = async () => {
          const tables = (
            await value.admin.query(
              "select tablename from pg_tables where schemaname='offline' order by tablename",
            )
          ).rows as { tablename: string }[];
          const rows: Record<string, unknown> = {};
          for (const { tablename } of tables)
            rows[tablename] = (
              await value.admin.query(
                `select to_jsonb(record)::text as bytes from offline.${value.admin.escapeIdentifier(tablename)} record order by to_jsonb(record)::text`,
              )
            ).rows;
          return rows;
        };
        const before = await snapshot();
        const catalogBefore = await collectStorageCatalog(value.admin, 'offline');
        expect(Object.keys(before).length).toBeGreaterThanOrEqual(12);
        await value.admin.query('begin');
        await value.admin.query(
          `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
        );
        await expect(
          value.admin.query(renderOfflineStorage(value.options).objectsSql),
        ).rejects.toMatchObject({ code: '42701' });
        await value.admin.query('rollback');
        expect(await snapshot()).toEqual(before);
        expect(await collectStorageCatalog(value.admin, 'offline')).toEqual(catalogBefore);
        await baseline(value);
        for (let repetition = 0; repetition < 2; repetition++) {
          await value.admin.query('begin');
          await value.admin.query(
            `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
          );
          const artifact = renderOfflineStorage(value.options);
          await value.admin.query(artifact.roleBindingsSql);
          await value.admin.query('commit');
          expect(await snapshot()).toEqual(before);
          expect(await collectStorageCatalog(value.admin, 'offline')).toEqual(catalogBefore);
          await baseline(value);
        }
      } finally {
        await dispose(value);
      }
    });
});
