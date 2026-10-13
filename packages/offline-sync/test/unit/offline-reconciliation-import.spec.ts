import { describe, expect, it } from 'vitest';
import { parseOfflineImportManifest } from '../../src/import-validation';
import { OfflineImportError } from '../../src/import-contract';
import { importManifest, IMPORT_AT, rehashManifest } from '../support/offline-import-fixtures';
import {
  reconciliationImportManifest,
  RECONCILIATION_IMPORT_ID,
} from '../support/offline-reconciliation-import-fixture';

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
});
