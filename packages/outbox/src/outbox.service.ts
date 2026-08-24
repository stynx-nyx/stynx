import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { FixedIntervalBackoffPolicy } from './backoff';
import {
  DEFAULT_OUTBOX_ACK_TABLE,
  DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE,
  DEFAULT_OUTBOX_TABLE,
  STYNX_OUTBOX_BACKOFF_POLICY,
  STYNX_OUTBOX_DISPATCHER,
  STYNX_OUTBOX_METRICS,
  STYNX_OUTBOX_OPTIONS,
} from './constants';
import { OutboxAlreadyEnqueuedError, OutboxAmbiguousAckError, OutboxNotFoundError } from './errors';
import { assertQualifiedIdentifier, errorMessage, isUniqueViolation, outboxColumns, toRows } from './row-mapper';
import type {
  OutboxAckInput,
  OutboxBackoffPolicy,
  OutboxDispatchOutcome,
  OutboxDispatcherPort,
  OutboxEnvelope,
  OutboxMetricsSink,
  OutboxModuleOptions,
  OutboxRow,
  OutboxSqlExecutor,
} from './types';

/**
 * Transactional outbox service.
 *
 * `enqueue()` is a pure function of a caller-supplied SQL executor (a
 * `@stynx-nyx/data` `Transaction`, or any object with a compatible
 * `query()`), so a caller composes it inside its own `database.tx(...)`
 * call and gets one atomic commit across the domain write and the outbox
 * row — the generalization pec's `TransmissionsService.enqueue` did not
 * offer (pec always opened its own transaction).
 *
 * Every other method (`dispatchDue`, `ack`, `retry`, `getOne`) owns its own
 * transaction via the injected `Database`, matching pec's shape 1:1.
 */
@Injectable()
export class OutboxService {
  private readonly table: string;
  private readonly ackTable: string;
  private readonly dispatchBatchSize: number;
  private readonly backoffPolicy: OutboxBackoffPolicy;

  constructor(
    private readonly database: Database,
    @Inject(STYNX_OUTBOX_OPTIONS)
    private readonly options: OutboxModuleOptions,
    @Optional()
    @Inject(STYNX_OUTBOX_DISPATCHER)
    private readonly dispatcher?: OutboxDispatcherPort,
    @Optional()
    @Inject(STYNX_OUTBOX_BACKOFF_POLICY)
    injectedBackoffPolicy?: OutboxBackoffPolicy,
    @Optional()
    @Inject(STYNX_OUTBOX_METRICS)
    private readonly metrics?: OutboxMetricsSink,
  ) {
    this.table = assertQualifiedIdentifier(options.table ?? DEFAULT_OUTBOX_TABLE, 'table');
    this.ackTable = assertQualifiedIdentifier(options.ackTable ?? DEFAULT_OUTBOX_ACK_TABLE, 'ackTable');
    this.dispatchBatchSize = options.dispatchBatchSize ?? DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE;
    this.backoffPolicy = injectedBackoffPolicy ?? options.backoffPolicy ?? new FixedIntervalBackoffPolicy();
  }

  /**
   * Enqueues (or, for a repeat call against the same `(entity, entityId)`,
   * touches) an outbox row inside the caller's own transaction. Tenant is
   * read from the active `app.tenant_id` session GUC — the same value RLS
   * itself checks — so the row can never be enqueued under a tenant the
   * transaction isn't already scoped to.
   */
  async enqueue(trx: OutboxSqlExecutor, envelope: OutboxEnvelope): Promise<OutboxRow> {
    const idempotencyKey = envelope.idempotencyKey ?? `${envelope.entity}:${envelope.entityId}`;
    try {
      const result = await trx.query<OutboxRow>(
        `insert into ${this.table} (id, tenant_id, entity, entity_id, payload, metadata, status, idempotency_key, next_attempt_at)
         values (
           gen_random_uuid(),
           nullif(current_setting('app.tenant_id', true), '')::uuid,
           $1, $2, $3::jsonb, $4::jsonb, 'PENDING', $5, null
         )
         on conflict (tenant_id, entity, entity_id)
         do update set updated_at = now(), idempotency_key = excluded.idempotency_key
         returning ${outboxColumns()}`,
        [
          envelope.entity,
          envelope.entityId,
          JSON.stringify(envelope.payload ?? {}),
          envelope.metadata ? JSON.stringify(envelope.metadata) : null,
          idempotencyKey,
        ],
      );
      const row = toRows(result)[0];
      if (!row) {
        throw new OutboxNotFoundError({ entity: envelope.entity, entityId: envelope.entityId });
      }
      this.metrics?.incrementEnqueued(envelope.entity);
      return row;
    } catch (error) {
      // The (tenant_id, entity, entity_id) conflict is absorbed by the
      // upsert above; only a *different* entity reusing an explicit
      // `idempotencyKey` can still violate the (tenant_id, idempotency_key)
      // unique constraint. Surface that as a typed conflict.
      if (isUniqueViolation(error)) {
        throw new OutboxAlreadyEnqueuedError({
          entity: envelope.entity,
          entityId: envelope.entityId,
          idempotencyKey,
        });
      }
      throw error;
    }
  }

  /** Reads one row by `(entity, entityId)`, scoped to the caller's active tenant via RLS. */
  async getOne(entity: string, entityId: string): Promise<OutboxRow> {
    return this.database.tx(
      async (trx) => {
        const result = await trx.query<OutboxRow>(
          `select ${outboxColumns()} from ${this.table} where entity = $1 and entity_id = $2`,
          [entity, entityId],
        );
        const row = toRows(result)[0];
        if (!row) {
          throw new OutboxNotFoundError({ entity, entityId });
        }
        return row;
      },
      { role: 'reader', readonly: true },
    );
  }

  /**
   * Claims up to `limit` due rows (`PENDING`/`ERROR` whose `next_attempt_at`
   * has passed) via `FOR UPDATE SKIP LOCKED`, marks them `SENT`, and — when a
   * dispatcher port is configured — hands each one to it. A dispatch failure
   * reverts that row to `ERROR` and schedules its next attempt through the
   * configured `OutboxBackoffPolicy`; it does not affect the other claimed
   * rows. Claiming spans all tenants (system context, `owner` role) so one
   * scheduler sweep drains the whole platform, matching the E3 "per-(tenant,
   * aggregate) ordering" spec note — rows are claimed oldest-`created_at`
   * first within that global sweep.
   *
   * With no dispatcher configured, this behaves exactly like pec's
   * `dispatchDue`: it claims and marks `SENT` without sending anything,
   * leaving actual delivery to the caller (or a future ack). Exposed as a
   * plain injectable method so `@stynx-nyx/jobs` or an app-level poller can
   * drive it on an interval — this package has no dependency on a job
   * runner.
   */
  async dispatchDue(limit: number = this.dispatchBatchSize): Promise<OutboxDispatchOutcome[]> {
    const claimed = await this.claimDue(limit);
    if (claimed.length === 0) {
      return [];
    }
    if (!this.dispatcher) {
      return claimed.map((row) => ({ row, dispatched: false }));
    }

    const outcomes: OutboxDispatchOutcome[] = [];
    for (const row of claimed) {
      try {
        await this.dispatcher.send(row);
        this.metrics?.incrementDispatched(row.entity, 'sent');
        outcomes.push({ row, dispatched: true });
      } catch (error) {
        const message = errorMessage(error);
        const updated = await this.recordDispatchFailure(row, message);
        this.metrics?.incrementDispatched(row.entity, 'error');
        outcomes.push({ row: updated, dispatched: false, error: message });
      }
    }
    return outcomes;
  }

  private async claimDue(limit: number): Promise<OutboxRow[]> {
    return this.database.withSystemContext('outbox claim', () =>
      this.database.tx(
        async (trx) => {
          const result = await trx.query<OutboxRow>(
            `with due as (
               select id
                 from ${this.table}
                where status in ('PENDING', 'ERROR')
                  and coalesce(next_attempt_at, created_at) <= now()
                order by created_at asc
                limit $1
                for update skip locked
             )
             update ${this.table} o
                set status = 'SENT',
                    attempts = attempts + 1,
                    last_error = null,
                    next_attempt_at = null,
                    updated_at = now()
               from due
              where o.id = due.id
              returning ${outboxColumns('o')}`,
            [limit],
          );
          return toRows(result);
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  private async recordDispatchFailure(row: OutboxRow, message: string): Promise<OutboxRow> {
    const nextAttemptAt = this.backoffPolicy.nextAttemptAt(row.attempts, new Date());
    return this.database.withSystemContext('outbox dispatch failure', () =>
      this.database.tx(
        async (trx) => {
          const result = await trx.query<OutboxRow>(
            `update ${this.table}
                set status = 'ERROR',
                    last_error = $2,
                    next_attempt_at = $3,
                    updated_at = now()
              where id = $1
              returning ${outboxColumns()}`,
            [row.id, message.slice(0, 4000), nextAttemptAt],
          );
          const updated = toRows(result)[0];
          if (!updated) {
            throw new OutboxNotFoundError({ id: row.id });
          }
          return updated;
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  /**
   * Manually resets a row to `PENDING` for redelivery — an operator action,
   * distinct from the automatic retry `dispatchDue()` performs on a
   * dispatcher failure. `immediate: true` makes it eligible right away;
   * otherwise the next attempt is scheduled through the backoff policy.
   */
  async retry(id: string, options: { immediate?: boolean } = {}): Promise<OutboxRow> {
    return this.database.withSystemContext('outbox retry', () =>
      this.database.tx(
        async (trx) => {
          const current = await trx.query<{ attempts: number }>(
            `select attempts from ${this.table} where id = $1`,
            [id],
          );
          const currentRow = toRows(current)[0];
          if (!currentRow) {
            throw new OutboxNotFoundError({ id });
          }
          const attempts = currentRow.attempts + 1;
          const nextAttemptAt = options.immediate
            ? new Date()
            : this.backoffPolicy.nextAttemptAt(attempts, new Date());
          const result = await trx.query<OutboxRow>(
            `update ${this.table}
                set attempts = $2,
                    status = 'PENDING',
                    last_error = null,
                    next_attempt_at = $3,
                    updated_at = now()
              where id = $1
              returning ${outboxColumns()}`,
            [id, attempts, nextAttemptAt],
          );
          const updated = toRows(result)[0];
          if (!updated) {
            throw new OutboxNotFoundError({ id });
          }
          return updated;
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  /**
   * Records an inbound ACK (positive or negative) for a message, keyed by
   * `(entity, entityId)` — the shape the external system's webhook body
   * naturally carries. Runs under system context / `owner` role because an
   * inbound webhook has no authenticated tenant context of its own (verify
   * `verifyOutboxAckSignature()` against the raw body before calling this).
   *
   * `(entity, entityId)` alone is only unique when the external system's
   * identifier space is; when it isn't, pass `tenantId` (e.g. echoed back by
   * the external system as a correlation field) to disambiguate. Two or more
   * tenants matching without a supplied `tenantId` raises
   * `OutboxAmbiguousAckError` rather than guessing.
   */
  async ack(input: OutboxAckInput): Promise<OutboxRow> {
    return this.database.withSystemContext('outbox ack', () =>
      this.database.tx(
        async (trx) => {
          const target = await this.resolveAckTarget(trx, input);
          const result = await trx.query<OutboxRow>(
            `update ${this.table}
                set status = $2::outbox.message_status,
                    ack_time = now(),
                    last_error = case when $2::text = 'ERROR' then $3 else null end,
                    updated_at = now()
              where id = $1
              returning ${outboxColumns()}`,
            [target.id, input.status, input.detail ?? null],
          );
          const row = toRows(result)[0];
          if (!row) {
            throw new OutboxNotFoundError({ entity: input.entity, entityId: input.entityId });
          }
          try {
            await trx.query(
              `insert into ${this.ackTable} (id, tenant_id, message_id, ack_status, ack_message, ack_time)
               values (gen_random_uuid(), $1, $2, $3, $4, now())
               on conflict (message_id) do nothing`,
              [row.tenantId, row.id, input.status, input.detail ?? null],
            );
          } catch (error) {
            if (!isUniqueViolation(error)) {
              throw error;
            }
          }
          this.metrics?.incrementAcked(row.entity, input.status === 'ACKED' ? 'acked' : 'error');
          return row;
        },
        { role: 'owner', readonly: false },
      ),
    );
  }

  private async resolveAckTarget(
    trx: OutboxSqlExecutor,
    input: OutboxAckInput,
  ): Promise<{ id: string; tenantId: string }> {
    const params: unknown[] = [input.entity, input.entityId];
    let whereTenant = '';
    if (input.tenantId) {
      params.push(input.tenantId);
      whereTenant = 'and tenant_id = $3::uuid';
    }
    const result = await trx.query<{ id: string; tenantId: string }>(
      `select id, tenant_id as "tenantId" from ${this.table} where entity = $1 and entity_id = $2 ${whereTenant}`,
      params,
    );
    const rows = toRows(result);
    if (rows.length === 0) {
      throw new OutboxNotFoundError({ entity: input.entity, entityId: input.entityId });
    }
    const [first] = rows;
    if (rows.length > 1 || !first) {
      throw new OutboxAmbiguousAckError({
        entity: input.entity,
        entityId: input.entityId,
        matches: rows.length,
      });
    }
    return first;
  }
}
