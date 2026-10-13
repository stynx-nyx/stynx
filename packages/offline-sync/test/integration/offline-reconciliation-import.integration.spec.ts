import { describe, expect, it } from 'vitest';
import { importOfflineState } from '../../src/import-state';
import { fixture, dispose, baseline, verify } from '../support/offline-storage-fixture';
import {
  reconciliationImportManifest,
  RECONCILIATION_IMPORT_ID,
} from '../support/offline-reconciliation-import-fixture';
import { OfflineImportError } from '../../src/import-contract';
import { IMPORT_AT, rehashManifest } from '../support/offline-import-fixtures';

// INV-OFFLINE-001: real custom auth.tenants, owner maintenance, /2 replay and zero history rewriting.
describe('Reconciliation history owner import', () => {
  it('imports twelve history kinds atomically, preserves original actor/time/result and resumes without repeating writes', async () => {
    const value = await fixture();
    try {
      const manifest = reconciliationImportManifest(value.tenants[0]);
      const begin = async () => {
        await value.admin.query('begin');
        await value.admin.query(
          `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
        );
      };
      await begin();
      await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('rollback');
      expect(
        (
          await value.admin.query(
            `select count(*)::text as count from offline.numbering_reconciliations`,
          )
        ).rows,
      ).toEqual([{ count: '0' }]);
      await begin();
      const receipt = await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('commit');
      expect(receipt.recordCounts).toMatchObject({ reconciliations: 1 });
      const capture = async () =>
        (
          await value.admin.query(
            `select id,tenant_id,reservation_id,actor_id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,claimed_numbers,user_ref,idempotency_key,request_fingerprint,result_json from offline.numbering_reconciliations`,
          )
        ).rows;
      const rows = await capture();
      expect(rows).toEqual([
        { ...manifest.records.at(-1)!.row, created_at: '2020-02-29T03:04:56.123456Z' },
      ]);
      expect(rows[0]!.id).toBe(RECONCILIATION_IMPORT_ID);
      expect(rows[0]!.result_json.consumption[0].finalizedAt).toBe(IMPORT_AT);
      const consumption = (
        await value.admin.query(
          `select to_jsonb(c)::text as row from offline.numbering_consumption c order by number`,
        )
      ).rows;
      await baseline(value);
      await begin();
      expect(await importOfflineState(value.admin, manifest, { storage: value.options })).toEqual(
        receipt,
      );
      await value.admin.query('commit');
      expect(await capture()).toEqual(rows);
      expect(
        (
          await value.admin.query(
            `select to_jsonb(c)::text as row from offline.numbering_consumption c order by number`,
          )
        ).rows,
      ).toEqual(consumption);
      expect(
        (
          await value.admin.query(
            `select count(*)::text as count from offline.sync_import_receipts`,
          )
        ).rows,
      ).toEqual([{ count: '1' }]);
    } finally {
      await dispose(value);
    }
  });
  for (const [label, change] of [
    [
      'missing snapshot tail',
      (row: Record<string, unknown>) => {
        (row.result_json as { consumption: unknown[] }).consumption.pop();
      },
    ],
    [
      'out-of-range snapshot number',
      (row: Record<string, unknown>) => {
        const result = row.result_json as { consumption: { number: number }[] };
        result.consumption[9]!.number = 999;
      },
    ],
    [
      'out-of-range claim',
      (row: Record<string, unknown>) => {
        row.claimed_numbers = ['999'];
        (row.result_json as Record<string, unknown>).missingOnServer = [999];
      },
    ],
    [
      'forged unexpected evidence',
      (row: Record<string, unknown>) => {
        (row.result_json as Record<string, unknown>).unexpectedOnServer = [];
      },
    ],
  ] as const)
    it(`refuses owner /2 import with ${label} and leaves no history prefix`, async () => {
      const value = await fixture();
      try {
        const manifest = reconciliationImportManifest(value.tenants[0]);
        change(manifest.records.at(-1)!.row as Record<string, unknown>);
        await value.admin.query('begin');
        await value.admin.query(
          `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
        );
        await expect(
          importOfflineState(value.admin, rehashManifest(manifest), { storage: value.options }),
        ).rejects.toBeInstanceOf(OfflineImportError);
        await value.admin.query('rollback');
        expect(
          (
            await value.admin.query(
              `select count(*)::text as count from offline.numbering_reconciliations`,
            )
          ).rows,
        ).toEqual([{ count: '0' }]);
        expect(
          (
            await value.admin.query(
              `select count(*)::text as count from offline.numbering_reservations`,
            )
          ).rows,
        ).toEqual([{ count: '0' }]);
        expect(
          (
            await value.admin.query(
              `select count(*)::text as count from offline.sync_import_receipts`,
            )
          ).rows,
        ).toEqual([{ count: '0' }]);
      } finally {
        await dispose(value);
      }
    });
  it('live verifier refuses owner-inserted forged historical result without comparing it with current consumption state', async () => {
    const value = await fixture();
    try {
      const manifest = reconciliationImportManifest(value.tenants[0]);
      await value.admin.query('begin');
      await value.admin.query(
        `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
      );
      await importOfflineState(value.admin, manifest, { storage: value.options });
      await value.admin.query('commit');
      await baseline(value);
      const row = structuredClone(manifest.records.at(-1)!.row) as Record<string, unknown>;
      row.id = '99999999-9999-4999-8999-999999999999';
      const result = row.result_json as Record<string, unknown>;
      result.reconciliationId = row.id;
      result.unexpectedOnServer = [];
      await value.admin.query('begin');
      await value.admin.query(
        `set local role ${value.admin.escapeIdentifier(value.options.ownerRole!)}`,
      );
      await value.admin.query(
        `insert into offline.numbering_reconciliations select (jsonb_populate_record(null::offline.numbering_reconciliations,$1::jsonb)).*`,
        [JSON.stringify(row)],
      );
      await value.admin.query('commit');
      const observation = await verify(value);
      expect(observation.supported).toBe(false);
      expect(
        observation.checks.some((finding) =>
          JSON.stringify(finding).includes('numbering_reconciliations'),
        ),
      ).toBe(true);
      expect(
        (
          await value.admin.query(
            `select count(*)::text as count from offline.numbering_reconciliations`,
          )
        ).rows,
      ).toEqual([{ count: '2' }]);
    } finally {
      await dispose(value);
    }
  });
});
