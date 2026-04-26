import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx/data';
import { STYNX_SYSTEM_OPERATION_SINK, type SystemOperationRecord, type SystemOperationSink } from '@stynx/core';

@Injectable()
export class TenantSystemOperationSink implements SystemOperationSink {
  constructor(private readonly moduleRef: ModuleRef) {}

  async write(record: SystemOperationRecord): Promise<void> {
    if (record.reason.startsWith('tenant membership validation')) {
      return;
    }

    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      await trx.query(
        `
          insert into audit.system_op (occurred_at, reason, actor_id, request_id, payload)
          values ($1::timestamptz, $2, $3::uuid, $4, $5::jsonb)
        `,
        [
          record.occurredAt,
          record.reason,
          record.actorId ?? null,
          record.requestId,
          JSON.stringify({ source: '@stynx/tenancy' }),
        ],
      );
    }, { role: 'owner' });
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to TenantSystemOperationSink');
    }
    return database;
  }
}

export const TENANT_SYSTEM_OPERATION_SINK_PROVIDER = {
  provide: STYNX_SYSTEM_OPERATION_SINK,
  useClass: TenantSystemOperationSink,
};
