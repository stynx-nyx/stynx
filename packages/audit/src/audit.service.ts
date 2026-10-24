import { auditPartitions, auditChainRows } from './audit.repository.js';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, executeConfiguredQuery } from '@stynx-nyx/data';
import { planAuditDetach } from './retention.js';
import {
  STYNX_AUDIT_ARCHIVE_STORE,
  STYNX_AUDIT_CLOCK,
  STYNX_AUDIT_DUMP_RUNNER,
  STYNX_AUDIT_OPTIONS,
  type AuditArchiveStore,
  type AuditClock,
  type AuditDumpRunner,
} from './tokens.js';
import type {
  AuditDetachPlan,
  AuditLogItem,
  AuditLogPage,
  AuditLogQuery,
  ChainVerificationResult,
  StynxAuditModuleOptions,
} from './types.js';



interface AuditLogRow {
  id: string | number;
  occurred_at: string | Date | number;
  table_schema: string;
  table_name: string;
  row_id: string | null;
  operation: string;
  tenant_id: string | null;
  actor_id: string | null;
  request_id: string | null;
  session_id: string | null;
  tags: Record<string, unknown> | unknown[] | string | number | boolean | null;
  payload: Record<string, unknown> | unknown[] | string | number | boolean | null;
}

interface AuditChainRow {
  event_id: string;
  occurred_at_text: string | null;
  tenancy_id_text: string | null;
  actor_id_text: string | null;
  entity: string | null;
  entity_id: string | null;
  operation_text: string | null;
  old_data_text: string | null;
  new_data_text: string | null;
  previous_hash: string | null;
  row_hash: string;
}

function cursorField(value: unknown, key: 'occurredAt' | 'id'): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading '${key}')`);
  }
  const boxed: unknown = Object(value);
  if (typeof boxed === 'object' && boxed !== null) {
    const field: unknown = Reflect.get(boxed, key);
    return field;
  }
  throw new TypeError('Unable to read cursor property');
}

@Injectable()
export class StynxAuditService {
  private readonly logger = new Logger(StynxAuditService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_AUDIT_OPTIONS)
    private readonly options: StynxAuditModuleOptions,
    @Inject(STYNX_AUDIT_CLOCK)
    private readonly clock: AuditClock,
    @Optional()
    @Inject(STYNX_AUDIT_DUMP_RUNNER)
    private readonly dumpRunner?: AuditDumpRunner | null,
    @Optional()
    @Inject(STYNX_AUDIT_ARCHIVE_STORE)
    private readonly archiveStore?: AuditArchiveStore | null,
  ) {}

  async listLog(query: AuditLogQuery = {}): Promise<AuditLogPage> {
    const database = this.requireDatabase();
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

    return database.withSystemContext('platform audit log read', async () =>
      database.tx(async (trx) => {
        const whereParts: string[] = [];
        const params: unknown[] = [];
        let index = 1;

        if (query.tenantId) {
          whereParts.push(`tenant_id::text = $${index++}`);
          params.push(query.tenantId);
        }
        if (query.actorId) {
          whereParts.push(`actor_id::text = $${index++}`);
          params.push(query.actorId);
        }
        if (query.tableSchema) {
          whereParts.push(`table_schema = $${index++}`);
          params.push(query.tableSchema);
        }
        if (query.tableName) {
          whereParts.push(`table_name = $${index++}`);
          params.push(query.tableName);
        }
        if (query.rowId) {
          whereParts.push(`row_id = $${index++}`);
          params.push(query.rowId);
        }
        if (query.from) {
          whereParts.push(`occurred_at >= $${index++}::timestamptz`);
          params.push(query.from);
        }
        if (query.to) {
          whereParts.push(`occurred_at <= $${index++}::timestamptz`);
          params.push(query.to);
        }
        if (cursor) {
          whereParts.push(`(occurred_at, id) < ($${index++}::timestamptz, $${index++}::bigint)`);
          params.push(cursorField(cursor, 'occurredAt'), cursorField(cursor, 'id'));
        }

        params.push(limit + 1);
        const rows = await trx.query<AuditLogRow>(
          `
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            ${whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : ''}
            order by occurred_at desc, id desc
            limit $${index}
          `,
          params,
        );

        const items = rows.rows.slice(0, limit).map((row) => this.mapLogRow(row));
        const tail = rows.rows[limit];
        return {
          items,
          ...(tail
            ? {
                nextCursor: this.encodeCursor({
                  occurredAt: this.toIso(tail.occurred_at),
                  id: Number(tail.id),
                }),
              }
            : {}),
        };
      }, { role: 'owner' }),
    );
  }

  async dryRunDetachEligible(now = this.clock.now()): Promise<AuditDetachPlan[]> {
    const database = this.requireDatabase();
    return database.withSystemContext('audit detach dry-run', async () =>
      database.tx(async (trx) => {
        const partitions = await trx.run(auditPartitions, [],
        );

        const plans: AuditDetachPlan[] = [];
        for (const row of partitions) {
          const month = this.partitionMonth(row.partition_name);
          if (!month) {
            continue;
          }
          const keepLonger = await executeConfiguredQuery(trx, 'audit.partition-retention', { partition: row.partition_name }, []);
          const plan = planAuditDetach(
            {
              partitionName: row.partition_name,
              month,
              containsLgpdRetentionTags: Boolean(keepLonger.rows[0]?.keep_longer),
            },
            now,
            this.options.keyPrefix ?? 'audit',
          );
          if (plan) {
            plans.push(plan);
          }
        }

        return plans;
      }, { role: 'owner' }),
    );
  }

  async detachEligible(now = this.clock.now()): Promise<AuditDetachPlan[]> {
    const plans = await this.dryRunDetachEligible(now);
    if (plans.length === 0) {
      return [];
    }
    if (!this.options.bucket || !this.dumpRunner || !this.archiveStore) {
      throw new Error('Audit detach requires bucket, dump runner, and archive store');
    }
    const dumpRunner = this.dumpRunner;
    const archiveStore = this.archiveStore;
    const bucket = this.options.bucket;

    const database = this.requireDatabase();
    await database.withSystemContext('audit detach execution', async () =>
      database.tx(async (trx) => {
        for (const plan of plans) {
          const dumpPath = join(tmpdir(), `${plan.partitionName}.sql.gz`);
          try {
            await dumpRunner.dumpPartition({
              schema: 'audit',
              table: plan.partitionName,
              destinationPath: dumpPath,
            });
            await archiveStore.uploadFile({
              bucket,
              key: plan.objectKey,
              path: dumpPath,
              contentType: 'application/gzip',
            });
            await executeConfiguredQuery(trx, 'audit.partition-detach', { partition: plan.partitionName }, []);
            await executeConfiguredQuery(trx, 'audit.partition-drop', { partition: plan.partitionName }, []);
          } finally {
            await rm(dumpPath, { force: true }).catch(() => undefined);
          }
        }
      }, { role: 'owner' }),
    );
    return plans;
  }

  async runDailyDetachJob(): Promise<void> {
    const detached = await this.detachEligible();
    if (detached.length > 0) {
      this.logger.log(`Detached ${detached.length} audit partition(s)`);
    }
  }

  async verifyChain(tenancyId: string, limit = 1000): Promise<ChainVerificationResult> {
    const database = this.requireDatabase();
    const sanitizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 10_000);

    return database.withSystemContext('audit hash-chain verification', async () =>
      database.tx(async (trx) => {
        const rows = await trx.run(auditChainRows,
          [tenancyId, sanitizedLimit],
        );

        let previousExpectedHash: string | null = null;
        let previousEventId: string | null = null;
        let totalChecked = 0;

        for (const row of rows) {
          totalChecked += 1;

          if (!previousEventId && row.previous_hash !== null) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: row.event_id,
            };
          }

          if (previousEventId && row.previous_hash !== previousExpectedHash) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: previousEventId,
            };
          }

          const expectedHash = this.hashAuditEventRow(row);
          if (expectedHash !== row.row_hash) {
            return {
              valid: false,
              totalChecked,
              firstBrokenEventId: row.event_id,
            };
          }

          previousExpectedHash = expectedHash;
          previousEventId = row.event_id;
        }

        return { valid: true, totalChecked };
      }, { role: 'owner', readonly: true }),
    );
  }

  private mapLogRow(row: AuditLogRow): AuditLogItem {
    return {
      id: Number(row.id),
      occurredAt: this.toIso(row.occurred_at),
      tableSchema: row.table_schema,
      tableName: row.table_name,
      rowId: row.row_id,
      operation: row.operation,
      tenantId: row.tenant_id,
      actorId: row.actor_id,
      requestId: row.request_id,
      sessionId: row.session_id,
      tags: row.tags ?? {},
      payload: row.payload ?? {},
    };
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to StynxAuditService');
    }
    return database;
  }

  private decodeCursor(raw: string): unknown {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  }

  private encodeCursor(cursor: { occurredAt: string | number; id: number }): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private toIso(value: string | Date | number): string | number {
    return value instanceof Date ? value.toISOString() : value;
  }

  private hashAuditEventRow(row: AuditChainRow): string {
    const payload = [
      row.event_id,
      row.occurred_at_text ?? '',
      row.tenancy_id_text ?? '',
      row.actor_id_text ?? '',
      row.entity ?? '',
      row.entity_id ?? '',
      row.operation_text ?? '',
      row.old_data_text ?? '',
      row.new_data_text ?? '',
      row.previous_hash ?? 'GENESIS',
    ].join('|');
    return createHash('sha256').update(payload).digest('hex');
  }

  private partitionMonth(partitionName: string): string | null {
    const match = /^log_(\d{4})_(\d{2})$/.exec(partitionName);
    if (!match?.[1] || !match[2]) {
      return null;
    }
    return `${match[1]}-${match[2]}`;
  }


}
