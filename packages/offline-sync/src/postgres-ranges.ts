import { randomUUID } from 'node:crypto';
import { Database, type Transaction } from '@stynx-nyx/data';
import { OfflineSyncConfigurationError, OfflineSyncUpgradeRequiredError } from './errors';
import { canonicalOfflineSyncPayload } from './payload-integrity';
import {
  cloneRange,
  rangeCancellation,
  rangeConflict,
  rangeCreation,
  rangeIdentity,
  rangeList,
  rangeNotFound,
} from './range-administration';
import type {
  CancelNumberingRangeInput,
  CreateNumberingRangeInput,
  ListNumberingRangesInput,
  NumberingRange,
  NumberingRangePage,
  TrustedOfflineSyncScope,
} from './types';

interface RangeRow {
  id: string;
  tenant_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  start_number: string | number;
  end_number: string | number;
  next_number: string | number;
  status: NumberingRange['status'];
  consumer_attributes: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string | null;
  cancelled_by: string | null;
  cancelled_at: Date | string | null;
  cancellation_reason: string | null;
  creation_fingerprint: string | null;
  creation_receipt: NumberingRange | null;
}
const columns = `id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt`;

function instant(value: string | Date): string {
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
    const { code, constraint } = error as { code?: string; constraint?: string };
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
      await trx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${scope.tenantId}:numbering-range-create:${input.idempotencyKey}`,
      ]);
      const prior = (
        await trx.query<RangeRow>(
          `select ${columns} from offline.numbering_ranges
        where tenant_id=$1::uuid and creation_key=$2`,
          [scope.tenantId, input.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (prior.creation_fingerprint !== fingerprint) throw rangeConflict('key');
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
          createdAt: instant(prior.created_at),
          createdBy: prior.created_by!,
          ...(input.consumerAttributes === undefined
            ? {}
            : { consumerAttributes: input.consumerAttributes }),
        };
        if (
          !prior.creation_receipt ||
          canonicalOfflineSyncPayload({ ...prior.creation_receipt }) !==
            canonicalOfflineSyncPayload({ ...expected })
        )
          throw new OfflineSyncConfigurationError('rangeCreationReceipt');
        return cloneRange(prior.creation_receipt);
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
      await trx.query<RangeRow>(
        `insert into offline.numbering_ranges
      (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
        consumer_attributes,created_by,created_at,creation_key,creation_fingerprint,creation_receipt)
      values ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$6,'active',$8::json,$9,$10::timestamptz,$11,$12,$13::jsonb)
      returning ${columns}`,
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
    ).rows[0]!;
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
        await trx.query<RangeRow>(
          `select ${columns} from offline.numbering_ranges
      where tenant_id=$1::uuid and id=$2::uuid`,
          [scope.tenantId, id],
        )
      ).rows[0];
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
        await trx.query<RangeRow>(
          `select ${columns} from offline.numbering_ranges
      where tenant_id=$1::uuid and ($2::text is null or org_unit_id=$2)
        and ($3::text is null or entity_type=$3) and ($4::text is null or series=$4)
        and ($5::text is null or status=$5) and ($6::uuid is null or id>$6::uuid)
      order by id limit $7`,
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
      ).rows;
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
      await trx.query<RangeRow>(
        `select ${columns} from offline.numbering_ranges
      where tenant_id=$1::uuid and id=$2::uuid for update`,
        [scope.tenantId, id],
      )
    ).rows[0];
    if (!row) throw rangeNotFound();
    if (row.status === 'cancelled') return mapRange(row);
    if (row.status !== 'active') throw rangeConflict('state');
    const at = instant(now);
    const changed = (
      await trx.query<RangeRow>(
        `update offline.numbering_ranges set status='cancelled',
      cancelled_by=$3,cancelled_at=$4::timestamptz,cancellation_reason=$5,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid returning ${columns}`,
        [scope.tenantId, id, scope.actorId, at, input.reason ?? null],
      )
    ).rows[0]!;
    return mapRange(changed);
  });
}
