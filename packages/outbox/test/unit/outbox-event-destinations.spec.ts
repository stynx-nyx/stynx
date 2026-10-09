import { OutboxService } from '../../src/outbox.service';
import type { OutboxAppendEvent, OutboxEntitySelector, OutboxSqlExecutor } from '../../src/types';

// UPS-OBX-07 (#316): declared destinations at append and the entity filter of both dispatch sweeps.

const tenant = '11111111-1111-4111-8111-111111111111';
const flat = (sql: unknown) => String(sql).replace(/\s+/gu, ' ').trim();
const event = (entity: string, key = entity): OutboxAppendEvent => ({ entity, entityId: 'aggregate-1', idempotencyKey: key, payload: {} });

/** Append transaction double: every insert is new unless its key is listed in `replayed`. */
function appendTrx(replayed: readonly string[] = []) {
  let sequence = 0;
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{
      tenant_id: tenant, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false,
    }] };
    if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '1s' }] };
    if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
    if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '42' }] };
    if (sql.includes('insert into outbox.events')) {
      return { rows: replayed.includes(String(params![4])) ? [] : [{ id: `event-${++sequence}`, entity: params![2] }] };
    }
    if (sql.includes('from outbox.events where tenant_id=$1::uuid and idempotency_key=$2')) {
      return { rows: [{ id: 'event-replayed', entity: params![2] }] };
    }
    return { rows: [] };
  }) as OutboxSqlExecutor['query'] & ReturnType<typeof vi.fn>;
  const deliveries = () => query.mock.calls
    .filter(([sql]) => String(sql).includes('insert into outbox.event_delivery'))
    .map(([, params]) => (params as unknown[])[1]);
  return { trx: { role: 'app', query } as never, deliveries };
}

const database = { appRoleName: 'stynx_app', currentTenantId: () => tenant };

function dispatchDatabase() {
  const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => { calls.push({ sql: flat(sql), params }); return { rows: [] }; });
  const tx = vi.fn(async (fn: (trx: never) => Promise<unknown>) => fn({ role: 'app', query } as never));
  return {
    calls, tx,
    database: { appRoleName: 'stynx_app', currentTenantId: () => tenant, withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()), tx },
  };
}

describe('UPS-OBX-07 destination declaration at append', () => {
  it('creates a delivery row only for an entity the declaration names exactly or by literal prefix', async () => {
    const service = new OutboxService(database as never, {
      dispatchableEntities: { entities: ['dest.renach'], entityPrefixes: ['dest.renaest.', 'dest.%'] },
    });
    const { trx, deliveries } = appendTrx();
    const rows = await service.appendManyInTransaction(trx, [
      event('dest.renach'), event('dest.renach.child'), event('dest.renaest.send'), event('dest.renaest'),
      event('DEST.RENACH'), event('log.rait'), event('dest.zz'), event('dest.%literal'),
    ]);
    // Every event is logged and returned; only the matching ones enter the delivery queue.
    expect(rows.map((row) => row.id)).toEqual(['event-1', 'event-2', 'event-3', 'event-4', 'event-5', 'event-6', 'event-7', 'event-8']);
    expect(deliveries()).toEqual(['event-1', 'event-3', 'event-8']);
  });

  it('keeps every appended event dispatchable without a declaration and none under an empty one', async () => {
    const undeclared = appendTrx();
    await new OutboxService(database as never, {}).appendManyInTransaction(undeclared.trx, [event('log.rait'), event('dest.renach')]);
    expect(undeclared.deliveries()).toEqual(['event-1', 'event-2']);

    for (const dispatchableEntities of [{}, { entities: [] }, { entityPrefixes: [] }] as OutboxEntitySelector[]) {
      const logOnly = appendTrx();
      await new OutboxService(database as never, { dispatchableEntities }).appendManyInTransaction(logOnly.trx, [event('log.rait'), event('dest.renach')]);
      expect(logOnly.deliveries()).toEqual([]);
    }
  });

  it('never creates a second delivery for an idempotent replay, destined or not', async () => {
    const service = new OutboxService(database as never, { dispatchableEntities: { entities: ['dest.renach'] } });
    const { trx, deliveries } = appendTrx(['replay-destined', 'replay-log']);
    const rows = await service.appendManyInTransaction(trx, [
      event('dest.renach', 'replay-destined'), event('log.rait', 'replay-log'), event('dest.renach', 'fresh'),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['event-replayed', 'event-replayed', 'event-1']);
    expect(deliveries()).toEqual(['event-1']);
  });

  it('rejects a malformed declaration when the service is constructed', () => {
    for (const dispatchableEntities of [
      null, 'dest.renach', 7, { entities: 'dest.renach' }, { entities: [''] }, { entities: [7] }, { entityPrefixes: [''] }, { entityPrefixes: {} },
    ] as never[]) {
      expect(() => new OutboxService(database as never, { dispatchableEntities })).toThrow(RangeError);
    }
    expect(() => new OutboxService(database as never, { dispatchableEntities: { entities: ['a'], entityPrefixes: ['b.'] } })).not.toThrow();
  });
});

describe('UPS-OBX-07 dispatch filtered by entity', () => {
  it('adds the entity predicate and its two parameters to the owner claim only when a filter is given', async () => {
    const { database: db, calls } = dispatchDatabase();
    const service = new OutboxService(db as never, { eventLeaseMs: 1_000 });
    await service.dispatchEventsDue(5);
    expect(calls[0]!.sql).not.toContain('unnest');
    expect(calls[0]!.params).toEqual([5, 1_000]);

    await service.dispatchEventsDue(5, { entities: ['dest.renach'], entityPrefixes: ['dest.renaest.'] });
    expect(calls[1]!.sql).toContain("and pd.status<>'ACKED' ) and (e.entity=any($3::text[]) or exists ( select 1 from unnest($4::text[]) as prefix(value) where left(e.entity,length(prefix.value))=prefix.value)) order by e.created_at,e.id limit $1 for update of d skip locked");
    expect(calls[1]!.params).toEqual([5, 1_000, ['dest.renach'], ['dest.renaest.']]);

    await service.dispatchEventsDue(5, { entities: ['dest.renach'] });
    expect(calls[2]!.params).toEqual([5, 1_000, ['dest.renach'], []]);
    expect(db.withSystemContext).toHaveBeenCalledTimes(3);
  });

  it('adds the entity predicate after the tenant predicates of the tenant claim only when a filter is given', async () => {
    const { database: db, calls } = dispatchDatabase();
    const service = new OutboxService(db as never, {});
    await service.dispatchTenantEventsDue(5);
    expect(calls[0]!.sql).not.toContain('unnest');
    expect(calls[0]!.params).toEqual([tenant, 5, 300_000]);

    await service.dispatchTenantEventsDue(5, { entityPrefixes: ['dest.renaest.'] });
    expect(calls[1]!.sql).toContain('where d.tenant_id=$1::uuid and e.tenant_id=$1::uuid');
    expect(calls[1]!.sql).toContain("and pd.status<>'ACKED' ) and (e.entity=any($4::text[]) or exists ( select 1 from unnest($5::text[]) as prefix(value) where left(e.entity,length(prefix.value))=prefix.value)) order by e.created_at,e.id limit $2 for update of d skip locked");
    expect(calls[1]!.params).toEqual([tenant, 5, 300_000, [], ['dest.renaest.']]);
    expect(db.withSystemContext).not.toHaveBeenCalled();
  });

  it('refuses an empty or malformed filter before any transaction', async () => {
    const { database: db, tx } = dispatchDatabase();
    const service = new OutboxService(db as never, {});
    for (const filter of [{}, { entities: [] }, { entities: [], entityPrefixes: [] }, { entities: [''] }, { entityPrefixes: [7] }, { entities: 'dest.renach' }, null, 'dest.renach'] as never[]) {
      await expect(service.dispatchEventsDue(5, filter)).rejects.toBeInstanceOf(RangeError);
      await expect(service.dispatchTenantEventsDue(5, filter)).rejects.toBeInstanceOf(RangeError);
    }
    expect(tx).not.toHaveBeenCalled();
    expect(db.withSystemContext).not.toHaveBeenCalled();
  });
});
