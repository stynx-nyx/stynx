import { describe, expect, it } from 'vitest';
import {
  parseOfflineImportManifest,
  validReconciliationEvidence,
  importDigest,
} from '../../src/import-validation.js';
import { OfflineImportError } from '../../src/import-contract.js';
import { importManifest, IMPORT_AT, rehashManifest } from '../support/offline-import-fixtures.js';
import {
  reconciliationImportManifest,
  RECONCILIATION_IMPORT_ID,
} from '../support/offline-reconciliation-import-fixture.js';

// INV-OFFLINE-001; ADR-MOBILE-OFFLINE-0005 D5: independent /1-/2 closed parser witnesses.
describe('Versioned reconciliation import contract', () => {
  it('preserves the exact eleven-kind /1 archive and accepts detached /2 reconciliation identity, timestamp and result evidence', () => {
    const original = importManifest();
    expect(parseOfflineImportManifest(JSON.stringify(original))).toEqual(original);
    expect(original.records).toHaveLength(11);
    const manifest = reconciliationImportManifest();
    const parsed = parseOfflineImportManifest(JSON.stringify(manifest));
    expect(parsed).toEqual(manifest);
    expect(parsed.records).toHaveLength(12);
    const row = parsed.records.find((record) => record.kind === 'reconciliations')!.row;
    expect(row).toMatchObject({
      id: RECONCILIATION_IMPORT_ID,
      created_at: IMPORT_AT,
      actor_id: 'historic-authenticated-audit-actor',
      idempotency_key: null,
      request_fingerprint: null,
      claimed_numbers: [],
      result_json: { reconciliationId: RECONCILIATION_IMPORT_ID, unexpectedOnServer: [1] },
    });
  });
  it('refuses a reconciliation kind in /1 without broadening its historical union', () => {
    const manifest = rehashManifest({
      ...reconciliationImportManifest(),
      formatVersion: 'stynx-offline-import/1',
    });
    expect(() => parseOfflineImportManifest(JSON.stringify(manifest))).toThrow(OfflineImportError);
  });
  for (const [label, change] of [
    [
      'unknown row field',
      (row: Record<string, unknown>) => {
        row.productionApproved = true;
      },
    ],
    [
      'unknown result field',
      (row: Record<string, unknown>) => {
        (row.result_json as Record<string, unknown>).verified = true;
      },
    ],
    [
      'wrong claim representation',
      (row: Record<string, unknown>) => {
        row.claimed_numbers = [1];
      },
    ],
    [
      'missing actor',
      (row: Record<string, unknown>) => {
        delete row.actor_id;
      },
    ],
    [
      'malformed timestamp',
      (row: Record<string, unknown>) => {
        row.created_at = 'not-an-instant';
      },
    ],
  ] as const)
    it(`refuses /2 ${label}`, () => {
      const manifest = reconciliationImportManifest();
      change(manifest.records.at(-1)!.row as Record<string, unknown>);
      expect(() => parseOfflineImportManifest(JSON.stringify(rehashManifest(manifest)))).toThrow(
        OfflineImportError,
      );
    });
  for (const [label, change] of [
    [
      'forged missing claims',
      (row: Record<string, unknown>) => {
        (row.result_json as Record<string, unknown>).missingOnServer = [1];
      },
    ],
    [
      'forged unexpected numbers',
      (row: Record<string, unknown>) => {
        (row.result_json as Record<string, unknown>).unexpectedOnServer = [];
      },
    ],
    [
      'duplicate consumption number',
      (row: Record<string, unknown>) => {
        const result = row.result_json as { consumption: unknown[] };
        result.consumption.push(result.consumption[0]);
      },
    ],
  ] as const)
    it(`refuses re-signed /2 ${label}`, () => {
      const manifest = reconciliationImportManifest();
      change(manifest.records.at(-1)!.row as Record<string, unknown>);
      expect(() => parseOfflineImportManifest(JSON.stringify(rehashManifest(manifest)))).toThrow(
        OfflineImportError,
      );
    });
  it('validates closed persisted evidence and complete reservation bounds independently of import parsing', () => {
    const row = () => structuredClone(reconciliationImportManifest().records.at(-1)!.row);
    const valid = row();
    expect(validReconciliationEvidence(valid, { start_number: '1', end_number: '10' })).toBe(true);
    const keyed = row();
    Object.assign(keyed, {
      user_ref: null,
      claimed_numbers: ['2'],
      idempotency_key: 'historic-key',
      request_fingerprint: importDigest({ claimedNumbers: [2], userRef: null }),
    });
    (keyed.result_json as Record<string, unknown>).missingOnServer = [2];
    expect(validReconciliationEvidence(keyed)).toBe(true);
    expect(validReconciliationEvidence(keyed, { start_number: '1', end_number: '10' })).toBe(true);
    for (const mutate of [
      (r: Record<string, unknown>) => {
        r.unknown = true;
      },
      (r: Record<string, unknown>) => {
        r.claimed_numbers = ['2', '2'];
      },
      (r: Record<string, unknown>) => {
        r.claimed_numbers = ['3', '2'];
      },
      (r: Record<string, unknown>) => {
        r.claimed_numbers = ['9007199254740992'];
      },
      (r: Record<string, unknown>) => {
        (r.result_json as Record<string, unknown>).reconciliationId =
          '99999999-9999-4999-8999-999999999999';
      },
      (r: Record<string, unknown>) => {
        (r.result_json as Record<string, unknown>).reservationId =
          '99999999-9999-4999-8999-999999999999';
      },
      (r: Record<string, unknown>) => {
        r.idempotency_key = 'unpaired';
      },
      (r: Record<string, unknown>) => {
        r.idempotency_key = 'wrong-fingerprint';
        r.request_fingerprint = '0'.repeat(64);
      },
      (r: Record<string, unknown>) => {
        r.actor_id = '\ud800';
      },
    ]) {
      const invalid = row();
      mutate(invalid as Record<string, unknown>);
      expect(validReconciliationEvidence(invalid)).toBe(false);
    }
    for (const bounds of [
      { start_number: 1, end_number: '10' },
      { start_number: '1', end_number: 10 },
    ])
      expect(
        validReconciliationEvidence(
          valid,
          bounds as unknown as import('../../src/import-validation.js').ReconciliationReservationBounds,
        ),
      ).toBe(false);
    const cyclic = row();
    (cyclic as Record<string, unknown>).cycle = cyclic;
    expect(validReconciliationEvidence(cyclic)).toBe(false);
  });
});
