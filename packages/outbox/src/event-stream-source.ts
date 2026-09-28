import { Database } from '@stynx-nyx/data';
import { OutboxClockAdmissionTimeoutError, OutboxClockAmbientTransactionError, OutboxEventTransactionError } from './errors';

export interface OutboxStreamScope { tenantId: string; actorId: string; sessionId?: string }
export interface OutboxStreamCursor { createdAt: Date; id: string }
export interface OutboxStreamRow extends OutboxStreamCursor { event: string; payload: Record<string, unknown> }

/** Structural EventStreamSource adapter; the outbox package has no backend dependency. */
export class OutboxEventStreamSource {
  private readonly preflights = new Map<string, Promise<void>>();
  constructor(private readonly database: Database, private readonly options: { lockTimeoutMs?: number } = {}) {}

  private async onPrimary(trx: { query<T extends object = object>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }): Promise<void> {
    const state = await trx.query<{ recovery: boolean; role: string | null; sql_role: string }>(
      `select pg_is_in_recovery() as recovery,current_setting('app.role',true) as role,current_user as sql_role`,
    );
    if (state.rows[0]?.recovery || state.rows[0]?.role !== 'app' || state.rows[0]?.sql_role !== 'stynx_app') {
      throw new OutboxEventTransactionError();
    }
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
      } finally { if (timer) clearTimeout(timer); }
    }
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => { release = resolve; });
    this.preflights.set(scope.tenantId, inFlight);
    try {
      return await this.database.withRequestContext(scope, () =>
        this.database.txIndependent(async (trx) => {
          await this.onPrimary(trx);
          await trx.query(`select set_config('lock_timeout',$1,true)`, [String(this.options.lockTimeoutMs ?? 250)]);
          const row = await trx.query<{ last_ms: string }>(
            `insert into outbox.tenant_clock (tenant_id,last_ms)
               values (nullif(current_setting('app.tenant_id',true),'')::uuid,
                       greatest(0,floor(extract(epoch from clock_timestamp())*1000)::bigint))
             on conflict (tenant_id) do update
               set last_ms=greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
             returning last_ms::text`,
          );
          return new Date(Number(row.rows[0]!.last_ms));
        }, { role: 'app', isolation: 'read committed', replica: false, retry: false }),
      );
    } finally {
      if (this.preflights.get(scope.tenantId) === inFlight) this.preflights.delete(scope.tenantId);
      release();
    }
  }

  async findById(id: string, scope: OutboxStreamScope): Promise<OutboxStreamRow | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) return null;
    return this.database.withRequestContext(scope, () => this.database.tx(async (trx) => {
      await this.onPrimary(trx);
      const result = await trx.query<OutboxStreamRow>(
        `select e.id,e.created_at as "createdAt",e.entity as event,e.payload
           from outbox.events e
          where e.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
            and e.id=coalesce((select m.event_id from outbox.legacy_event_map m
                                where m.tenant_id=e.tenant_id and m.legacy_id=$1::uuid),$1::uuid)
          limit 1`, [id],
      );
      return result.rows[0] ?? null;
    }, { role: 'app', readonly: true, replica: false, retry: false }));
  }

  async listSince(cursor: OutboxStreamCursor, scope: OutboxStreamScope, limit: number): Promise<readonly OutboxStreamRow[]> {
    return this.database.withRequestContext(scope, () => this.database.tx(async (trx) => {
      await this.onPrimary(trx);
      const result = await trx.query<OutboxStreamRow>(
        `select id,created_at as "createdAt",entity as event,payload
           from outbox.events
          where tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
            and (created_at>$1::timestamptz or (created_at=$1::timestamptz
                 and ($2='' or id>nullif($2,'')::uuid)))
          order by created_at,id limit $3`, [cursor.createdAt,cursor.id,limit],
      );
      return result.rows;
    }, { role: 'app', readonly: true, replica: false, retry: false }));
  }
}
