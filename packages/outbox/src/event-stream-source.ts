import type { OutboxTimestampResult } from './types.js';
import { streamPrimaryAdmission, streamLockTimeout, streamClock, streamFindById, streamListSince } from './event-stream.repository.js';
import { Database, executeTypedQuery } from '@stynx-nyx/data';
import {
  OutboxClockAdmissionTimeoutError,
  OutboxClockAmbientTransactionError,
  OutboxEventTransactionError,
} from './errors.js';

export interface OutboxStreamScope {
  tenantId: string;
  actorId: string;
  sessionId?: string;
}
export interface OutboxStreamCursor {
  createdAt: Date;
  id: string;
}
export interface OutboxStreamRow {
  id: string;
  createdAt: OutboxTimestampResult;
  event: string;
  payload: Record<string, unknown>;
}

/** Structural EventStreamSource adapter; the outbox package has no backend dependency. */
export class OutboxEventStreamSource {
  private readonly preflights = new Map<string, Promise<void>>();
  constructor(
    private readonly database: Database,
    private readonly options: { lockTimeoutMs?: number } = {},
  ) {}

  private async onPrimary(trx: {
    query<T extends object = object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  }): Promise<void> {
    const state = await executeTypedQuery(trx, streamPrimaryAdmission, []);
    const live = state[0];
    const reason = live?.recovery
      ? 'recovery'
      : live?.role !== 'app'
        ? 'app_role'
        : live.sql_role !== this.database.appRoleName
          ? 'sql_role'
          : undefined;
    if (reason) throw new OutboxEventTransactionError(reason);
  }

  async now(scope: OutboxStreamScope): Promise<Date> {
    if (this.database.hasHeldConnection()) throw new OutboxClockAmbientTransactionError();
    const deadline = Date.now() + (this.options.lockTimeoutMs ?? 250);
    while (this.preflights.has(scope.tenantId)) {
      const holder = this.preflights.get(scope.tenantId)!;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new OutboxClockAdmissionTimeoutError();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          holder,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new OutboxClockAdmissionTimeoutError()), remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.preflights.set(scope.tenantId, inFlight);
    try {
      return await this.database.withRequestContext(scope, () =>
        this.database.txIndependent(
          async (trx) => {
            await this.onPrimary(trx);
            await executeTypedQuery(trx, streamLockTimeout, [
              String(this.options.lockTimeoutMs ?? 250),
            ]);
            const row = await executeTypedQuery(trx, streamClock, []);
            return new Date(Number(row[0]!.last_ms));
          },
          { role: 'app', isolation: 'read committed', replica: false, retry: false },
        ),
      );
    } finally {
      if (this.preflights.get(scope.tenantId) === inFlight) this.preflights.delete(scope.tenantId);
      release();
    }
  }

  async findById(id: string, scope: OutboxStreamScope): Promise<OutboxStreamRow | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) return null;
    return this.database.withRequestContext(scope, () =>
      this.database.tx(
        async (trx) => {
          await this.onPrimary(trx);
          const result = await executeTypedQuery(trx, streamFindById, [id]);
          return result[0] ?? null;
        },
        { role: 'app', readonly: true, replica: false, retry: false },
      ),
    );
  }

  async listSince(
    cursor: OutboxStreamCursor,
    scope: OutboxStreamScope,
    limit: number,
  ): Promise<readonly OutboxStreamRow[]> {
    return this.database.withRequestContext(scope, () =>
      this.database.tx(
        async (trx) => {
          await this.onPrimary(trx);
          const result = await executeTypedQuery(trx, streamListSince, [cursor.createdAt, cursor.id, limit]);
          return [...result];
        },
        { role: 'app', readonly: true, replica: false, retry: false },
      ),
    );
  }
}
