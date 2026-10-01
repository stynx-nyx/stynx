import { createHash } from 'node:crypto';
import { OutboxService } from '../../src/outbox.service';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import { OutboxCustomTableCutoverUnsupportedError, OutboxEventTransactionError } from '../../src/errors';
import type { OutboxSqlExecutor } from '../../src/types';

const tenant = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const flat = (sql: unknown) => String(sql).replace(/\s+/gu, ' ').trim();

function recordingDatabase(query: OutboxSqlExecutor['query'], trxRole = 'owner') {
  const txOptions: unknown[] = [];
  const systemReasons: string[] = [];
  const database = {
    currentTenantId: () => tenant,
    withSystemContext: vi.fn(async (reason: string, fn: () => Promise<unknown>) => { systemReasons.push(reason); return fn(); }),
    withRequestContext: vi.fn(async (_scope: unknown, fn: () => Promise<unknown>) => fn()),
    hasHeldConnection: () => false,
    tx: vi.fn(async (fn: (trx: never) => Promise<unknown>, options: unknown) => { txOptions.push(options); return fn({ role: trxRole, query } as never); }),
    txIndependent: vi.fn(async (fn: (trx: never) => Promise<unknown>, options: unknown) => { txOptions.push(options); return fn({ role: trxRole, query } as never); }),
  };
  return { database, txOptions, systemReasons };
}

describe('UPS-OBX-09 contract verifications', () => {
  it('V-01 appendInTransaction uses only the caller transaction and refuses a non-app transaction', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{
        tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false,
      }] };
      if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '1s' }] };
      if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
      if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '42' }] };
      if (sql.includes('insert into outbox.events')) return { rows: [{ id: eventId }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const { database } = recordingDatabase(vi.fn() as never);
    const service = new OutboxService(database as never, {});
    const event = { entity: 'renach.item', entityId: '1', idempotencyKey: 'k', payload: {} };
    await service.appendInTransaction({ role: 'app', query } as never, event);
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.txIndependent).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
    const clock = query.mock.calls.find(([sql]) => String(sql).includes('outbox.tenant_clock'));
    expect(flat(clock?.[0])).toContain('set last_ms = greatest(outbox.tenant_clock.last_ms,excluded.last_ms)');
    const insert = query.mock.calls.find(([sql]) => String(sql).includes('insert into outbox.events'));
    expect(insert?.[1]).toEqual(['42', tenant, 'renach.item', '1', 'k', '{}', null]);
    await expect(service.appendInTransaction({ role: 'owner', query } as never, event)).rejects.toBeInstanceOf(OutboxEventTransactionError);
  });

  it('V-03 dispatchEventsDue claims as owner in system context, oldest head first, with eventLeaseMs, backoff and hashed evidence', async () => {
    const claim = { tenant_id: tenant, event_id: eventId, attempts: 3, status: 'SENT', entity: 'renach.item', entity_id: '1',
      idempotency_key: 'k', payload: {}, metadata: null, created_at: new Date(10) };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('with due as')) return { rows: [claim] };
      if (sql.includes("set status='ERROR'")) return { rows: [{ event_id: eventId }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const { database, txOptions, systemReasons } = recordingDatabase(query);
    const backoff = { nextAttemptAt: vi.fn(() => new Date(1_000)) };
    const failure = Object.assign(new Error('provider down'), { evidence: { requestBytes: Buffer.from('wire-request'), responseStatus: 503 } });
    const service = new OutboxService(database as never, { eventLeaseMs: 1_234, lockTimeoutMs: 900 }, {
      send: async () => undefined, sendEvent: async () => { throw failure; },
    }, backoff);
    const [outcome] = await service.dispatchEventsDue(7);

    expect(systemReasons).toEqual(['outbox event claim', 'outbox event failure']);
    expect(txOptions).toEqual([
      { role: 'owner', retry: false, lockTimeoutMs: 250 }, { role: 'owner', retry: false, lockTimeoutMs: 250 },
    ]);
    const [claimSql, claimParams] = query.mock.calls[0]!;
    expect(claimParams).toEqual([7, 1_234]);
    expect(flat(claimSql)).toContain("(d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp()) or (d.status='SENT' and d.lease_until<clock_timestamp())");
    expect(flat(claimSql)).toContain("(p.created_at,p.id)<(e.created_at,e.id) and pd.status<>'ACKED'");
    expect(flat(claimSql)).toContain('order by e.created_at,e.id limit $1 for update of d skip locked');
    expect(flat(claimSql)).toContain("lease_until=clock_timestamp()+($2::integer * interval '1 millisecond')");
    expect(flat(query.mock.calls[1]![0])).toContain("values ($1::uuid,$2::uuid,$3,'CLAIMED',clock_timestamp())");
    expect(query.mock.calls[1]![1]).toEqual([tenant, eventId, 3]);
    expect(backoff.nextAttemptAt).toHaveBeenCalledWith(3, expect.any(Date));
    const ledger = query.mock.calls.find(([sql]) => String(sql).includes("update outbox.event_attempts set result='ERROR'"));
    expect(ledger?.[1]).toEqual([tenant, eventId, 3, 'provider down', null, null, Buffer.from('wire-request'),
      createHash('sha256').update(Buffer.from('wire-request')).digest('hex'), null, null, null, 503, expect.any(String)]);
    expect(outcome).toMatchObject({ dispatched: false, row: { status: 'ERROR', nextAttemptAt: new Date(1_000).toISOString() } });
  });

  it('V-04 ackEvent owns owner transactions, never regresses ACKED and appends each verified receipt', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select id from outbox.events')) return { rows: [{ id: eventId }] };
      if (sql.includes('select attempts from outbox.event_delivery')) return { rows: [{ attempts: 2 }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const { database, txOptions, systemReasons } = recordingDatabase(query);
    const service = new OutboxService(database as never, {});
    const input = { tenantId: tenant, eventId, rawBody: Buffer.from('ack'), status: 'ERROR' as const, hmacVerified: true };
    await service.ackEvent(input);
    await service.ackEvent(input);
    expect(systemReasons).toEqual(['outbox event ack lookup', 'outbox event ack', 'outbox event ack lookup', 'outbox event ack']);
    expect(txOptions[0]).toEqual({ role: 'owner', readonly: true, retry: false });
    expect(txOptions[1]).toEqual({ role: 'owner', retry: false, lockTimeoutMs: 250 });
    const updates = query.mock.calls.filter(([sql]) => String(sql).includes('update outbox.event_delivery'));
    expect(updates.every(([sql]) => flat(sql).endsWith("where tenant_id=$1::uuid and event_id=$2::uuid and status<>'ACKED'"))).toBe(true);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('insert into outbox.event_acks'))).toHaveLength(2);
    // Anything but literal `hmacVerified: true` is quarantined and refused.
    await expect(service.ackEvent({ ...input, hmacVerified: 'true' as never })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(query.mock.calls.at(-1)?.[1]).toEqual([Buffer.from('ack'), expect.any(String), 'invalid-hmac']);
    await expect(service.ackEvent({ ...input, idempotencyKey: 'k' })).rejects.toMatchObject({ code: 'OUTBOX_NOT_FOUND' });
    expect(query.mock.calls.at(-1)?.[1]).toEqual([Buffer.from('ack'), expect.any(String), 'missing-or-ambiguous-event-identity']);
  });

  it('V-05 OutboxEventStreamSource maps entity to event and reads strictly after the cursor in the request scope', async () => {
    const query = vi.fn(async (sql: string) => sql.includes('pg_is_in_recovery')
      ? { rows: [{ recovery: false, role: 'app', sql_role: 'stynx_app' }] } : { rows: [] }) as OutboxSqlExecutor['query'];
    const { database, txOptions } = recordingDatabase(query, 'app');
    const source = new OutboxEventStreamSource(database as never);
    const scope = { tenantId: tenant, actorId: 'actor' };
    await source.listSince({ createdAt: new Date(5), id: eventId }, scope, 10);
    await expect(source.findById(eventId, scope)).resolves.toBeNull();
    expect(database.withRequestContext).toHaveBeenCalledWith(scope, expect.any(Function));
    expect(txOptions).toEqual([
      { role: 'app', readonly: true, replica: false, retry: false }, { role: 'app', readonly: true, replica: false, retry: false },
    ]);
    const list = query.mock.calls.find(([sql]) => String(sql).includes('order by created_at,id'));
    expect(flat(list?.[0])).toContain('entity as event');
    expect(flat(list?.[0])).toContain("(created_at>$1::timestamptz or (created_at=$1::timestamptz and ($2='' or id>nullif($2,'')::uuid)))");
    expect(list?.[1]).toEqual([new Date(5), eventId, 10]);
    const find = query.mock.calls.find(([sql]) => String(sql).includes('legacy_event_map'));
    expect(flat(find?.[0])).toContain("where e.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid");
  });

  it('V-06 cutoverLegacyMessages refuses custom tables before SQL and otherwise runs as owner in system context', async () => {
    const custom = recordingDatabase(vi.fn() as never);
    await expect(new OutboxService(custom.database as never, { ackTable: 'app.acks' }).cutoverLegacyMessages())
      .rejects.toBeInstanceOf(OutboxCustomTableCutoverUnsupportedError);
    expect(custom.database.tx).not.toHaveBeenCalled();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('select state,generation')) return { rows: [{ state: 'NEW', generation: '1' }] };
      if (sql.includes('count(*)')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    }) as OutboxSqlExecutor['query'];
    const platform = recordingDatabase(query);
    await new OutboxService(platform.database as never, {}).cutoverLegacyMessages();
    expect(platform.systemReasons).toEqual(['outbox legacy cutover']);
    expect(platform.txOptions).toEqual([{ role: 'owner', isolation: 'read committed', retry: false }]);
  });
});
