import { createFakeTransaction } from '../../../testing/src/fake-transaction.js';
import { QueryRowValidationError } from '@stynx-nyx/data';
import * as native from '../../src/storage-invariants.repository.js';
import * as overlay from '../../src/import-overlay.repository.js';
import { inspectOfflineRows } from '../../src/storage-invariants.js';

// Independent named leaves bind pairing/order without depending on the production container.
const pairs = [
  { table: 'numbering_ranges', native: native.finiteNumberingRanges, overlay: overlay.overlayFiniteNumberingRanges },
  { table: 'numbering_reservations', native: native.finiteNumberingReservations, overlay: overlay.overlayFiniteNumberingReservations },
  { table: 'sync_queue_items', native: native.finiteSyncQueueItems, overlay: overlay.overlayFiniteSyncQueueItems },
  { table: 'sync_conflicts', native: native.finiteSyncConflicts, overlay: overlay.overlayFiniteSyncConflicts },
  { table: 'sync_batches', native: native.finiteSyncBatches, overlay: overlay.overlayFiniteSyncBatches },
  { table: 'sync_batch_transport_keys', native: native.finiteSyncBatchTransportKeys, overlay: overlay.overlayFiniteSyncBatchTransportKeys },
  { table: 'sync_item_receipts', native: native.finiteSyncItemReceipts, overlay: overlay.overlayFiniteSyncItemReceipts },
  { table: 'sync_item_attempts', native: native.finiteSyncItemAttempts, overlay: overlay.overlayFiniteSyncItemAttempts },
  { table: 'numbering_consumption', native: native.finiteNumberingConsumption, overlay: overlay.overlayFiniteNumberingConsumption },
  { table: 'sync_conflict_evidence', native: native.finiteSyncConflictEvidence, overlay: overlay.overlayFiniteSyncConflictEvidence },
  { table: 'sync_conflict_actions', native: native.finiteSyncConflictActions, overlay: overlay.overlayFiniteSyncConflictActions },
  { table: 'numbering_reconciliations', native: native.finiteNumberingReconciliations, overlay: overlay.overlayFiniteNumberingReconciliations },

];
const overlayValues: overlay.OfflineImportOverlayParams = [
  '["slot0"]', '["slot1"]', '["slot2"]', '["slot3"]', '["slot4"]',
  '["slot5"]', '["slot6"]', '["slot7"]', '["slot8"]', '["slot9"]',
  '["slot10"]', '["slot11"]', '["slot12"]',
];
const empty = () => ({ rows: [], rowCount: 0 });
const findings = (index: number) => ({ rows: [{ tenantId: `tenant-${index}`, count: String(index + 1) }], rowCount: 1 });

for (const mode of ['native', 'overlay'] as const) {
  const params = mode === 'overlay' ? overlayValues : [];
  const overlayInput = mode === 'overlay' ? overlayValues : undefined;
  const initial = mode === 'overlay' ? overlay.overlayInspectInvariantFindings : native.inspectInvariantFindings;
  const tail = mode === 'overlay' ? [
    overlay.overlayInspectRangeCreationEvidence, overlay.overlayInspectReconciliationEvidence,
    overlay.overlayInspectReservationScopes, overlay.overlayInspectImportLedger, overlay.overlayInspectArchivedResponses,
  ] : [
    native.inspectRangeCreationEvidence, native.inspectReconciliationEvidence,
    native.inspectReservationScopes, native.inspectImportLedger, native.inspectArchivedResponses,
  ];
  describe(`${mode} finite instant dispatch`, () => {
    it('executes all twelve exact SQL/parameter pairs in order through the actual checked runner', async () => {
      const fake = createFakeTransaction([empty(), ...pairs.map((_, index) => findings(index)), ...tail.map(empty)], { role: 'reader' });
      const result = await inspectOfflineRows(fake.transaction, overlayInput);
      expect(result).toEqual(pairs.map(({ table }, index) => ({ tenantId: `tenant-${index}`, count: String(index + 1), finding: `finite-instant:${table}` })));
      expect(fake.queries).toEqual([initial, ...pairs.map((pair) => pair[mode]), ...tail].map((query) => ({ text: query.text, values: params })));
      expect(fake.queries).toHaveLength(18);
      expect(new Set(pairs.map((pair) => pair[mode].text)).size).toBe(12);
      console.log('OFFLINE_FINITE_BASELINE ' + JSON.stringify({ mode, pairs: pairs.map((pair, index) => ({ table: pair.table, name: pair[mode].name, text: fake.queries[index + 1]?.text, values: fake.queries[index + 1]?.values })) }));
    });

    it.each(pairs.map((pair, index) => ({ table: pair.table, index })))('stops at $table and preserves the original query failure', async ({ index }) => {
      const failure = new Error(`finite failure ${index}`);
      const fake = createFakeTransaction([empty(), ...pairs.slice(0, index).map((_, previous) => findings(previous)), failure], { role: 'reader' });
      await expect(inspectOfflineRows(fake.transaction, overlayInput)).rejects.toBe(failure);
      expect(fake.queries).toEqual([initial, ...pairs.slice(0, index + 1).map((pair) => pair[mode])].map((query) => ({ text: query.text, values: params })));
      expect(fake.queries).toHaveLength(index + 2);
    });

    it('validates every finding row before exposing results or advancing to the next table', async () => {
      const fake = createFakeTransaction([empty(), { rows: [{ tenantId: 'valid', count: '1' }, { tenantId: 'private-tenant', count: 42 }], rowCount: 2 }], { role: 'reader' });
      const error = await inspectOfflineRows(fake.transaction, overlayInput).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(QueryRowValidationError);
      expect(error).toMatchObject({ rowIndex: 1 });
      expect(JSON.stringify(error)).not.toContain('private-tenant');
      expect(fake.queries).toHaveLength(2);
      expect(fake.queries[1]).toEqual({ text: pairs[0]?.[mode].text, values: params });
    });
  });
}
