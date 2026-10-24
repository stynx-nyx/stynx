import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { OutboxService } from '../../src/outbox.service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const input = { idempotencyKey: 'retirement-key', reason: 'Destination removed' };
const timestampCases = [
  { label: 'ordinary Date', direct: new Date('2026-10-23T00:00:00.789Z'), json: '2026-10-23T00:00:00.789Z' },
  { label: 'configured parser string', direct: '2026-10-23 00:00:00.789+00', json: '2026-10-23T00:00:00.789Z' },
  { label: 'positive infinity', direct: Infinity, json: 'infinity' },
  { label: 'negative infinity', direct: -Infinity, json: '-infinity' },
  { label: 'outside JavaScript Date range', direct: new Date(Number.NaN), json: '294276-01-01T00:00:00+00:00' },
];

function receipt(retiredAt: unknown) {
  return { id: actorId, tenantId, eventId, ...input, actorId, previousStatus: 'ERROR', retiredAt };
}

function harness(respond: (sql: string, params?: unknown[]) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => respond(sql, params));
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) =>
    executeGuardedQueryRows({ query }, statement, params, guard);
  const transaction = { query, run, runGuarded, role: 'app' };
  const database = {
    appRoleName: 'stynx_app', currentTenantId: () => tenantId,
    tx: vi.fn(async (work: (trx: typeof transaction) => unknown) => work(transaction)),
  };
  // Narrow runtime test ports do not claim to implement the complete Database API.
  const service: unknown = Reflect.construct(OutboxService, [database, {}]);
  return { service, transaction, database, query };
}

describe.each(timestampCases)('outbox retirement representation: $label', ({ direct, json }) => {
  it.each(['insert', 'replay', 'get'])('preserves the raw driver timestamp on direct %s', async (path) => {
    const row = receipt(direct);
    const { service, database, query } = harness((sql) => {
      if (sql.includes('from outbox.event_delivery') && sql.includes('for update'))
        return { rows: [{ status: path === 'replay' ? 'RETIRED' : 'ERROR', leaseUntil: null, actorId }] };
      if (sql.includes('insert into outbox.event_retirements')) return { rows: [row] };
      if (sql.includes('from outbox.event_retirements')) return { rows: path === 'insert' ? [] : [row] };
      if (sql.includes('update outbox.event_delivery')) return { rows: [] };
      throw new Error(`Unexpected SQL in retirement observation: ${sql}`);
    });
    const result: unknown = path === 'get'
      ? await Reflect.apply(OutboxService.prototype.getEventRetirement, service, [eventId])
      : await Reflect.apply(OutboxService.prototype.retireEvent, service, [eventId, input]);
    expect(result).toBe(row);
    expect(result).toMatchObject({ retiredAt: direct });
    expect(query).toHaveBeenCalledTimes(path === 'insert' ? 4 : path === 'replay' ? 2 : 1);
    expect(database.tx).toHaveBeenCalledTimes(1);
    if (path === 'insert') {
      expect(query.mock.calls[2]?.[1]).toEqual([tenantId, eventId, input.idempotencyKey, input.reason, 'ERROR']);
      expect(query.mock.calls[3]?.[0]).toContain('update outbox.event_delivery');
    }
  });

  it('keeps nested JSON receipt mapping as a copied Date result, including InvalidDate', async () => {
    const nested = receipt(json);
    const { service, query } = harness((sql) => {
      expect(sql).toContain('row_to_json(receipt)');
      return { rows: [{ id: eventId, tenantId, entity: 'record.changed', entityId: 'record-1',
        idempotencyKey: 'event-key', metadata: null, createdAt: new Date(0), status: 'RETIRED',
        attempts: 1, lastError: null, nextAttemptAt: null, leaseUntil: null, updatedAt: new Date(0),
        retirement: nested }] };
    });
    const result: unknown = await Reflect.apply(OutboxService.prototype.getEventDelivery, service, [eventId]);
    expect(result).toMatchObject({ delivery: { retirement: { retiredAt: expect.any(Date) } } });
    expect(result).toMatchObject({ delivery: { retirement: { ...nested, retiredAt: new Date(json) } } });
    expect(nested.retiredAt).toBe(json);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('row_to_json(receipt)'), [tenantId, eventId]);
  });
});

describe.each(['insert', 'replay'])('append %s result metadata', (path) => {
  it.each([undefined, { extension: [null, true, { nested: 'retained' }] }])(
    'returns an own null field for omission and retains object metadata', async (metadata) => {
      const event = { entity: 'record.changed', entityId: 'record-1', idempotencyKey: 'event-key', payload: { version: 1 },
        ...(metadata === undefined ? {} : { metadata }) };
      const row = { ...event, id: eventId, tenantId, createdAt: new Date(10), metadata: metadata ?? null };
      const { service, transaction, query } = harness((sql, params) => {
        if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ tenant_id: tenantId, role: 'app', sql_role: 'stynx_app', isolation: 'read committed', read_only: 'off', recovery: false }] };
        if (sql.includes("current_setting('lock_timeout')")) return { rows: [{ value: '7s' }] };
        if (sql.includes("current_setting('stynx.audit_chain_key'")) return { rows: [{ key: null }] };
        if (sql.includes('from outbox.legacy_ownership')) return { rows: [{ state: 'LEGACY' }] };
        if (sql.includes('select set_config(')) return { rows: [{ set_config: params?.[0] }] };
        if (sql.includes('pg_advisory_xact_lock')) return { rows: [{ pg_advisory_xact_lock: '' }] };
        if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '10' }] };
        if (sql.includes('insert into outbox.events')) return { rows: path === 'insert' ? [row] : [] };
        if (sql.includes('from outbox.events where')) return { rows: [row] };
        if (sql.includes('insert into outbox.event_delivery')) return { rows: [] };
        throw new Error(`Unexpected SQL in append observation: ${sql}`);
      });
      const result: unknown = await Reflect.apply(OutboxService.prototype.appendInTransaction, service, [transaction, event]);
      expect(result).toBe(row);
      expect(Object.hasOwn(row, 'metadata')).toBe(true);
      expect(row.metadata).toBe(metadata ?? null);
      const inserts = query.mock.calls.filter(([sql]) => sql.includes('insert into outbox.events'));
      expect(inserts).toHaveLength(1);
      expect(inserts[0]?.[1]?.[6]).toBe(metadata === undefined ? null : JSON.stringify(metadata));
      const replays = query.mock.calls.filter(([sql]) => sql.includes('from outbox.events where'));
      expect(replays).toHaveLength(path === 'replay' ? 1 : 0);
      if (path === 'replay') {
        expect(replays[0]?.[0]).toContain('metadata is not distinct from $6::jsonb');
        expect(replays[0]?.[1]?.[5]).toBe(metadata === undefined ? null : JSON.stringify(metadata));
      }
    },
  );
});
