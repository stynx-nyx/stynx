import {
  importManifest,
  IMPORT_AT,
  IMPORT_ID,
  IMPORT_TENANT,
  rehashManifest,
} from './offline-import-fixtures.js';

export const RECONCILIATION_IMPORT_ID = '88888888-8888-4888-8888-888888888888';
/** Independent immutable archive, deliberately predating this release and carrying no invented request key. */
export function reconciliationImportManifest(tenantId = IMPORT_TENANT) {
  const original = importManifest();
  const records = original.records.map((record) => ({
    ...record,
    row: { ...record.row, tenant_id: tenantId },
  }));
  const row = {
    id: RECONCILIATION_IMPORT_ID,
    tenant_id: tenantId,
    reservation_id: IMPORT_ID,
    actor_id: 'historic-authenticated-audit-actor',
    created_at: IMPORT_AT,
    claimed_numbers: [] as string[],
    user_ref: 'historic-business-reviewer',
    idempotency_key: null,
    request_fingerprint: null,
    result_json: {
      reconciliationId: RECONCILIATION_IMPORT_ID,
      reservationId: IMPORT_ID,
      status: 'expired',
      consumption: Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        status: index === 0 ? 'applied' : 'expired',
        serverEntityId: index === 0 ? 'server' : null,
        finalizedAt: index === 0 ? IMPORT_AT : null,
      })),
      missingOnServer: [],
      unexpectedOnServer: [1],
    },
  };
  return rehashManifest({
    ...original,
    formatVersion: 'stynx-offline-import/2',
    records: [...records, { kind: 'reconciliations', row }],
    mappings: [
      ...original.mappings.map((mapping) => ({
        ...mapping,
        tenantId,
        targetKey: {
          ...mapping.targetKey,
          ...('tenant_id' in mapping.targetKey ? { tenant_id: tenantId } : {}),
        },
      })),
      {
        kind: 'reconciliations',
        tenantId,
        sourceKey: 'opaque/historic/reconciliation-1',
        targetKey: { tenant_id: tenantId, id: RECONCILIATION_IMPORT_ID },
      },
    ],
  });
}
