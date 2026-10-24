import { lockRangeCreation, rangeByCreationKey, insertRange, rangeById, listRanges, lockRangeById, cancelRange, type RangeRow } from './ranges.repository.js';
import { randomUUID } from 'node:crypto';
import { Database, type Transaction } from '@stynx-nyx/data';
import { OfflineSyncConfigurationError, OfflineSyncUpgradeRequiredError } from './errors.js';
import { canonicalOfflineSyncPayload } from './payload-integrity.js';
import { importInstantMicroseconds } from './import-validation.js';
import {
  cloneRange,
  rangeCancellation,
  rangeConflict,
  rangeCreation,
  rangeIdentity,
  rangeList,
  rangeNotFound,
} from './range-administration.js';
import type {
  CancelNumberingRangeInput,
  CreateNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRange,
  NumberingRangePage,
  TrustedOfflineSyncScope,
} from './types.js';



function instant(value: string | Date | number): string {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) throw new OfflineSyncConfigurationError('rangeTimestamp');
  return at.toISOString();
}

function mapRange(row: RangeRow): NumberingRange {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    orgUnitId: row.org_unit_id,
    entityType: row.entity_type,
    series: row.series,
    startNumber: Number(row.start_number),
    endNumber: Number(row.end_number),
    nextNumber: Number(row.next_number),
    status: row.status,
    ...(row.consumer_attributes === null ? {} : { consumerAttributes: row.consumer_attributes }),
    ...(row.created_by === null ? {} : { createdBy: row.created_by }),
    createdAt: instant(row.created_at),
    ...(row.updated_at === null ? {} : { updatedAt: instant(row.updated_at) }),
    ...(row.cancelled_by === null ? {} : { cancelledBy: row.cancelled_by }),
    ...(row.cancelled_at === null ? {} : { cancelledAt: instant(row.cancelled_at) }),
    ...(row.cancellation_reason === null ? {} : { cancellationReason: row.cancellation_reason }),
  };
}

async function transaction<T>(
  database: Database,
  run: (trx: Transaction) => Promise<T>,
  readonly = false,
): Promise<T> {
  try {
    return await database.tx(run, {
      readonly,
      isolation: 'read committed',
      requireActor: true,
      retry: false,
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const constraint = typeof error === 'object' && error !== null && 'constraint' in error ? error.constraint : undefined;
    if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError('0007');
    if (code === '23505' && constraint === 'numbering_ranges_tenant_creation_key_uq')
      throw rangeConflict('key');
    if (
      code === '23505' &&
      constraint === 'numbering_ranges_tenant_id_org_unit_id_entity_type_series_key'
    )
      throw rangeConflict('scope');
    throw error;
  }
}

export async function pgCreateNumberingRange(
  database: Database,
  scope: TrustedOfflineSyncScope,
  original: CreateNumberingRangeInput,
  now: string,
): Promise<NumberingRange> {
  const { input, fingerprint } = rangeCreation(scope, original);
  return transaction(database, async (trx) => {
    if (input.idempotencyKey !== undefined) {
      await trx.run(lockRangeCreation, [
        `${scope.tenantId}:numbering-range-create:${input.idempotencyKey}`,
      ]);
      const prior = (
        await trx.run(rangeByCreationKey,
          [scope.tenantId, input.idempotencyKey],
        )
      );
      if (prior) {
        if (prior.creation_fingerprint !== fingerprint) throw rangeConflict('key');
        const receipt = prior.creation_receipt;
        if (typeof receipt !== 'object' || receipt === null || Array.isArray(receipt) ||
            typeof receipt.createdAt !== 'string' || prior.created_by === null) {
          throw new OfflineSyncConfigurationError('rangeCreationReceipt');
        }
        let receiptInstantMatches = false;
        try {
          receiptInstantMatches = importInstantMicroseconds(receipt.createdAt) === BigInt(prior.created_us);
        } catch {
          /* Malformed persisted creation evidence fails closed. */
        }
        if (!receiptInstantMatches) throw new OfflineSyncConfigurationError('rangeCreationReceipt');
        const expected: NumberingRange = {
          id: prior.id,
          tenantId: scope.tenantId,
          orgUnitId: input.orgUnitId,
          entityType: input.entityType,
          series: input.series,
          startNumber: input.startNumber,
          endNumber: input.endNumber,
          nextNumber: input.startNumber,
          status: 'active',
          createdAt: receipt.createdAt,
          createdBy: prior.created_by,
          ...(input.consumerAttributes === undefined
            ? {}
            : { consumerAttributes: input.consumerAttributes }),
        };
        if (
          !prior.creation_receipt ||
          canonicalOfflineSyncPayload({ ...receipt }) !==
            canonicalOfflineSyncPayload({ ...expected })
        )
          throw new OfflineSyncConfigurationError('rangeCreationReceipt');
        return cloneRange(expected);
      }
    }
    const createdAt = instant(now);
    const range: NumberingRange = {
      id: randomUUID(),
      tenantId: scope.tenantId,
      orgUnitId: input.orgUnitId,
      entityType: input.entityType,
      series: input.series,
      startNumber: input.startNumber,
      endNumber: input.endNumber,
      nextNumber: input.startNumber,
      status: 'active',
      createdBy: scope.actorId,
      createdAt,
      ...(input.consumerAttributes === undefined
        ? {}
        : { consumerAttributes: input.consumerAttributes }),
    };
    const inserted = (
      await trx.run(insertRange,
        [
          range.id,
          scope.tenantId,
          input.orgUnitId,
          input.entityType,
          input.series,
          input.startNumber,
          input.endNumber,
          input.consumerAttributes === undefined ? null : JSON.stringify(input.consumerAttributes),
          scope.actorId,
          createdAt,
          input.idempotencyKey ?? null,
          input.idempotencyKey === undefined ? null : fingerprint,
          input.idempotencyKey === undefined ? null : JSON.stringify(range),
        ],
      )
    );
    return mapRange(inserted);
  });
}

export async function pgGetNumberingRange(
  database: Database,
  scope: TrustedOfflineSyncScope,
  original: string,
): Promise<NumberingRange | null> {
  const id = rangeIdentity(original);
  return transaction(
    database,
    async (trx) => {
      const row = (
        await trx.run(rangeById,
          [scope.tenantId, id],
        )
      );
      return row ? mapRange(row) : null;
    },
    true,
  );
}

export async function pgListNumberingRanges(
  database: Database,
  scope: TrustedOfflineSyncScope,
  original: ListNumberingRangesInput,
): Promise<NumberingRangePage> {
  const input = rangeList(original);
  return transaction(
    database,
    async (trx) => {
      const rows = (
        await trx.run(listRanges,
          [
            scope.tenantId,
            input.orgUnitId ?? null,
            input.entityType ?? null,
            input.series ?? null,
            input.status ?? null,
            input.cursor ?? null,
            input.limit + 1,
          ],
        )
      );
      const items = rows.slice(0, input.limit).map(mapRange);
      return { items, nextCursor: rows.length > input.limit ? items[items.length - 1]!.id : null };
    },
    true,
  );
}

export async function pgCancelNumberingRange(
  database: Database,
  scope: TrustedOfflineSyncScope,
  original: string,
  originalInput: CancelNumberingRangeInput,
  now: string,
): Promise<NumberingRange> {
  const id = rangeIdentity(original);
  const input = rangeCancellation(originalInput);
  return transaction(database, async (trx) => {
    const row = (
      await trx.run(lockRangeById,
        [scope.tenantId, id],
      )
    );
    if (!row) throw rangeNotFound();
    if (row.status === 'cancelled') return mapRange(row);
    if (row.status !== 'active') throw rangeConflict('state');
    const at = instant(now);
    const changed = (
      await trx.run(cancelRange,
        [scope.tenantId, id, scope.actorId, at, input.reason ?? null],
      )
    );
    return mapRange(changed);
  });
}
