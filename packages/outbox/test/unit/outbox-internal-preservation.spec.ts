import { OutboxService } from '../../src/outbox.service.js';
import { OutboxOwnershipContentionError } from '../../src/errors.js';
const tenant = '11111111-1111-4111-8111-111111111111';
function invoke(owner: object, key: string, ...args: unknown[]): unknown {
  const method: unknown = Reflect.get(owner, key);
  if (typeof method !== 'function') throw new Error(`Missing method ${key}`);
  return Reflect.apply(method, owner, args);
}
function fixture(rows: Record<string, unknown>[] = [], options: Record<string, unknown> = {}) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows }));
  const tx = vi.fn(async (fn: (trx: { query: typeof query }) => unknown, _options?: unknown) => fn({ query }));
  const withSystemContext = vi.fn(async (_reason: string, fn: () => unknown) => fn());
  const database = { currentTenantId: () => tenant, tx, withSystemContext };
  return { query, tx, withSystemContext, service: new OutboxService(database as never, options as never) };
}
describe('Outbox seven internal assertion preservation boundaries', () => {
  afterEach(() => vi.useRealTimers());
  it('retains all six status keys, order and last duplicate count while total sums all rows', async () => {
    const h = fixture([{ status: 'ERROR', count: 2, oldest: null }, { status: 'PENDING', count: 3, oldest: null }, { status: 'ERROR', count: 7, oldest: null }]);
    const result = await h.service.getQueueHealth();
    expect(Object.keys(result.byStatus)).toEqual(['PENDING','SENT','SENT_UNRESOLVED','ERROR','ACKED','RETIRED']);
    expect(result.byStatus).toEqual({ PENDING:3, SENT:0, SENT_UNRESOLVED:0, ERROR:7, ACKED:0, RETIRED:0 });
    expect(result.total).toBe(12); expect(result.oldestUnackedCreatedAt).toBeNull(); expect(h.query).toHaveBeenCalledTimes(1);
  });
  it('retains custom selector iteration after the original array validation', () => {
    const events: string[]=[]; const entities=['before'];
    entities[Symbol.iterator]=function*(){ events.push('iterate'); expect(this).toBe(entities); yield 'yielded'; yield 'yielded'; };
    const h=fixture([], { dispatchableEntities:{entities} });
    expect(Reflect.get(h.service,'dispatchable')).toEqual({entities:['yielded','yielded'],prefixes:[]}); expect(events).toEqual(['iterate']);
  });
  it('retains sparse selector observation without manufacturing an element predicate', () => {
    const entities=new Array<string>(2); entities[1]='valid'; const h=fixture([], {dispatchableEntities:{entities}});
    expect(Reflect.get(h.service,'dispatchable')).toEqual({entities:[undefined,'valid'],prefixes:[]});
  });
  it.each([null, 2, {}, [''], ['valid', 7]])('retains malformed selector rejection %j', entities => {
    expect(()=>fixture([], {dispatchableEntities:{entities}})).toThrow(RangeError);
  });
  it('reads dispatcher send once with original getter receiver and preserves thrown identity', () => {
    const error=new Error('send getter'); const calls:unknown[]=[]; const port={get send(){calls.push(this);throw error;}};
    let observed:unknown; try{fixture([], {destinations:[{name:'one',selector:{entities:['e']},dispatcher:port}]});}catch(e){observed=e;}
    expect(observed).toBe(error); expect(calls).toEqual([port]);
  });
  it('retains a callable dispatcher reference without binding or invoking it', () => {
    const send=vi.fn();const port={send};const h=fixture([], {destinations:[{name:'one',selector:{entities:['e']},dispatcher:port}]});
    const destinations:unknown=Reflect.get(h.service,'destinations');expect(destinations).toBeInstanceOf(Map);
    if(!(destinations instanceof Map))throw new Error('Expected destination registry');
    expect(destinations.get('one').dispatcher).toBe(port);expect(send).not.toHaveBeenCalled();
  });
  it('preserves nested retry code precedence and repeated context getter receivers', () => {
    const events:string[]=[];const context={get code(){events.push('code');expect(this).toBe(context);return undefined;},get originalCode(){events.push('original');return '55P03';}};
    const error={get context(){events.push('context');expect(this).toBe(error);return context;},get code(){throw new Error('unreached');}};
    expect(invoke(fixture().service,'mapOwnershipError',error)).toBeInstanceOf(OutboxOwnershipContentionError);
    expect(events).toEqual(['context','code','context','original']);
  });
  it('does not read fallback retry properties after a nonnull first code', () => {
    const error={context:{code:'not-retryable',get originalCode(){throw new Error('unreached');}},get code(){throw new Error('unreached');}};
    expect(invoke(fixture().service,'mapOwnershipError',error)).toBe(error);
  });
  it.each([null,undefined,3,'error'])('retains optional retry-property handling for %s', error => {
    expect(invoke(fixture().service,'mapOwnershipError',error)).toBe(error);
  });
  it('preserves retry getter exception identity', () => {
    const error=new Error('getter');let observed:unknown;try{invoke(fixture().service,'mapOwnershipError',{get context(){throw error;}});}catch(e){observed=e;}expect(observed).toBe(error);
  });
  it.each([null,undefined])('ownership catch retains direct-property nullish TypeError for %s', error => {
    const h=fixture();h.query.mockRejectedValueOnce(error);
    return expect(invoke(h.service,'ownership',{query:h.query})).rejects.toMatchObject({name:'TypeError',message:`Cannot read properties of ${error} (reading 'code')`});
  });
  it('ownership catch reads code from the original receiver and maps only lock contention', async () => {
    const h=fixture();const seen:unknown[]=[];const error={get code(){seen.push(this);return '55P03';}};h.query.mockRejectedValueOnce(error);
    await expect(invoke(h.service,'ownership',{query:h.query})).rejects.toBeInstanceOf(OutboxOwnershipContentionError);expect(seen).toEqual([error]);expect(h.query).toHaveBeenCalledTimes(1);
    const sentinel=new Error('property failure');h.query.mockRejectedValueOnce({get code(){throw sentinel;}});
    await expect(invoke(h.service,'ownership',{query:h.query})).rejects.toBe(sentinel);
  });
  it('retries only the declared SQL code and preserves transaction options and exhausted identity', async () => {
    vi.useFakeTimers(); const h=fixture();const error={code:'40P01'};h.tx.mockRejectedValue(error);
    const outcome=Promise.resolve(invoke(h.service,'ownerRetry','reason',async()=>undefined)).catch((value:unknown)=>value);
    await vi.runAllTimersAsync();expect(await outcome).toBe(error);expect(h.tx).toHaveBeenCalledTimes(4);
    for(const call of h.tx.mock.calls)expect(call[1]).toEqual({role:'owner',retry:false,lockTimeoutMs:250});
    expect(h.withSystemContext).toHaveBeenCalledTimes(4);
  });
  it('preserves status custom iterator, duplicate order and selected values', async () => {
    const values=['ignored']; const seen:unknown[]=[];values[Symbol.iterator]=function*(){seen.push(this);yield 'ERROR';yield 'PENDING';yield 'ERROR';};const h=fixture();
    expect(await h.service.listEvents({deliveryStatus:values as never})).toEqual({items:[],nextCursor:null});expect(seen).toEqual([values]);expect(h.query.mock.calls[0]?.[1]?.[1]).toEqual(['ERROR','PENDING','ERROR']);
  });
  it('rejects sparse and invalid yielded status before database work', async () => {
    const h=fixture();const sparse=new Array(1);await expect(h.service.listEvents({deliveryStatus:sparse})).rejects.toThrow(RangeError);
    const values=['ERROR'];values[Symbol.iterator]=function*(){yield 'BAD';};await expect(h.service.listEvents({deliveryStatus:values as never})).rejects.toThrow(RangeError);expect(h.tx).not.toHaveBeenCalled();
  });
});
