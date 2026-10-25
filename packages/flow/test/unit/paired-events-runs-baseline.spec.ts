import { executeGuardedQueryRows, executeTypedQuery, QueryRowValidationError, type Transaction } from '@stynx-nyx/data';
import { FlowRuntimeService } from '../../src/flow-runtime.service.js';

type Result = { rows: unknown[]; readonly rowCount?: number };
type Step = Result | Error | (() => Promise<Result>);

function makeService(steps: Step[] = [{ rows: [] }, { rows: [] }]) {
  let position = 0;
  const query = vi.fn(async (_text: string, _values?: unknown[]): Promise<Result> => {
    const next = steps[position++];
    if (next === undefined) throw new Error('Unexpected additional query');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  });
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard);
  const trx = { query, run, runGuarded };
  const tx = vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => fn(trx));
  const service = new FlowRuntimeService({ tx } as never, {} as never, {} as never);
  return { service, query, tx };
}


const families = [
  { name: 'events', method: 'listEvents', fields: ['runId', 'nodeId', 'taskId', 'kind', 'actorId'], columns: ['run_id', 'node_id', 'task_id', 'kind', 'actor_id'], uuidCount: 3, order: 'created_at desc, id desc' },
  { name: 'runs', method: 'listRuns', fields: ['scopeId', 'graphId', 'targetType', 'targetId', 'status'], columns: ['scope_id', 'graph_id', 'target_type', 'target_id', 'status'], uuidCount: 2, order: 'created_at desc' },
] as const;
for (const family of families) {
  const invoke = (service: FlowRuntimeService, input: Record<string, unknown> = {}) => service[family.method](input);
  const sql = (where: string, count: number) => `select * from flow.${family.name}${where} order by ${family.order} limit $${count + 1} offset $${count + 2}`;
  const countSql = (where: string) => `select count(*)::text as total from flow.${family.name}${where}`;
  describe(`Flow ${family.name} paired read preconversion baseline`, () => {
    for (let mask = 0; mask < 32; mask++) {
      it(`captures exact paired SQL and binds mask ${mask}`, async () => {
        const input: Record<string, unknown> = { page: 2, pageSize: 3 };
        const values: string[] = []; const clauses: string[] = [];
        family.fields.forEach((field, bit) => {
          if (mask & (1 << bit)) {
            const value = bit < family.uuidCount ? `0190abcd-1234-7abc-89ab-00000000000${bit + 1}` : `opaque %_${bit}`;
            input[field] = value; values.push(value);
            clauses.push(`${family.columns[bit]} = $${values.length}${bit < family.uuidCount ? '::uuid' : ''}`);
          }
        });
        const where = clauses.length ? ` where ${clauses.join(' and ')}` : '';
        const h = makeService([{ rows: [{ opaque_key: 'value' }] }, { rows: [{ total: '7' }] }]);
        expect(await invoke(h.service, input)).toEqual({ data: [{ opaqueKey: 'value' }], meta: { page: 2, pageSize: 3, total: 7 } });
        expect(h.query.mock.calls).toEqual([[sql(where, values.length), [...values, 3, 3]], [countSql(where), values]]);
        expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { role: 'reader', readonly: true });
        console.log('FLOW_PAIRED_BASELINE ' + JSON.stringify({ family: family.name, mask, calls: h.query.mock.calls }));
      });
    }
    it.each([undefined, null, '', false, 0, [], {}])('omits unsupported or empty filters %s', async (value) => {
      const h = makeService(); await invoke(h.service, Object.fromEntries(family.fields.map((field) => [field, value])));
      expect(h.query.mock.calls).toEqual([[sql('', 0), [50, 0]], [countSql(''), []]]);
    });
    it('preserves whitespace and wildcard strings without trimming', async () => {
      const h = makeService(); const values = family.fields.map(() => ' %_ ');
      await invoke(h.service, Object.fromEntries(family.fields.map((field, i) => [field, values[i]])));
      const where = ' where ' + family.columns.map((column, i) => `${column} = $${i + 1}${i < family.uuidCount ? '::uuid' : ''}`).join(' and ');
      expect(h.query.mock.calls).toEqual([[sql(where, 5), [...values, 50, 0]], [countSql(where), values]]);
    });
    it.each([
      { input: {}, page: 1, size: 50, offset: 0 },
      { input: { page: 2.5, pageSize: 3.5 }, page: 2.5, size: 3.5, offset: 5.25 },
      { input: { page: Infinity, pageSize: Infinity }, page: Infinity, size: 100, offset: Infinity },
      { input: { page: -Infinity, pageSize: -Infinity }, page: 1, size: 1, offset: 0 },
      { input: { page: 0, pageSize: 0 }, page: 1, size: 50, offset: 0 },
      { input: { page: NaN, pageSize: NaN }, page: 1, size: 50, offset: 0 },
      { input: { page: '3', pageSize: '4' }, page: 3, size: 4, offset: 8 },
      { input: { page: null, pageSize: null }, page: 1, size: 50, offset: 0 },
      { input: { page: 9007199254740992, pageSize: 101 }, page: 9007199254740992, size: 100, offset: (9007199254740992 - 1) * 100 },
    ])('preserves pagination coercion $input', async ({input,page,size,offset}) => {
      const h = makeService(); expect(await invoke(h.service,input)).toEqual({data:[],meta:{page,pageSize:size,total:0}});
      expect(h.query.mock.calls).toEqual([[sql('',0),[size,offset]],[countSql(''),[]]]);
    });
    it('reads pagination then five filters once before the transaction', async () => {
      const reads: string[] = []; const h = makeService(); const input = {};
      for (const field of ['page','pageSize',...family.fields]) Object.defineProperty(input,field,{get(){reads.push(field); return field === 'page' ? 2 : field === 'pageSize' ? 4 : 'value';}});
      h.tx.mockImplementationOnce(async (fn) => {reads.push('tx'); return fn({query:h.query,run:(q,p)=>executeTypedQuery({query:h.query},q,p),runGuarded:(q,p,g)=>executeGuardedQueryRows({query:h.query},q,p,g)});});
      await invoke(h.service,input); expect(reads).toEqual(['page','pageSize',...family.fields,'tx']);
    });
    it('retains opaque own keys and nested identity through camelization', async () => {
      const nested = { date:new Date(0),big:1n,absent:undefined }; const array=[nested]; const proto={opaque:true};
      const row={nested_value:nested,array_value:array};Object.defineProperty(row,'__proto__',{value:proto,enumerable:true});
      const h=makeService([{rows:[row]},{rows:[{total:'1'}]}]);const result=await invoke(h.service);
      expect(result.data).toEqual([{nestedValue:nested,arrayValue:array,_Proto__:proto}]);
      if(!Array.isArray(result.data)) throw new Error('Expected data array');const first:unknown=result.data[0];
      if(first===null||typeof first!=='object') throw new Error('Expected row');
      expect(Reflect.get(first,'nestedValue')).toBe(nested);expect(Reflect.get(first,'arrayValue')).toBe(array);
      expect(Object.hasOwn(first,'_Proto__')).toBe(true);expect(Reflect.get(first,'_Proto__')).toBe(proto);
    });
    it.each([
      {rows:[],expected:0},{rows:[{}],expected:0},{rows:[{total:null}],expected:0},{rows:[{total:undefined}],expected:0},
      {rows:[{total:'12'},{total:'999'}],expected:12},{rows:[{total:'1.5'}],expected:1.5},{rows:[{total:'Infinity'}],expected:Infinity},{rows:[{total:'unparsed'}],expected:NaN},
    ])('retains first nullish count and Number conversion $rows',async({rows,expected})=>{
      const h=makeService([{rows:[]},{rows}]);expect(await invoke(h.service)).toEqual({data:[],meta:{page:1,pageSize:50,total:expected}});expect(h.query).toHaveBeenCalledTimes(2);
    });
    it('does not read either unused rowCount getter',async()=>{
      const getter=vi.fn(()=>{throw new Error('unused metadata');});const h=makeService([{rows:[],get rowCount(){return getter();}},{rows:[{total:'0'}],get rowCount(){return getter();}}]);
      await invoke(h.service);expect(getter).not.toHaveBeenCalled();expect(h.query).toHaveBeenCalledTimes(2);
    });
    it('awaits data before count',async()=>{
      let release:(value:Result)=>void=()=>{throw new Error('uninitialized');};const pending=new Promise<Result>(resolve=>{release=resolve;});
      const h=makeService([()=>pending,{rows:[{total:'0'}]}]);const result=invoke(h.service);expect(h.query).toHaveBeenCalledTimes(1);release({rows:[]});await result;expect(h.query).toHaveBeenCalledTimes(2);
    });
    it.each([0,1])('preserves driver error identity and stops at phase %i',async(phase)=>{
      const error=new Error('driver');const h=makeService(phase===0?[error]:[{rows:[]},error]);await expect(invoke(h.service)).rejects.toBe(error);expect(h.query).toHaveBeenCalledTimes(phase+1);
    });
    it('filter error occurs before SQL or transaction',()=>{
      const error=new Error('filter');const h=makeService();const input=Object.defineProperty({},family.fields[0],{get(){throw error;}});
      expect(()=>invoke(h.service,input)).toThrow(error);expect(h.tx).not.toHaveBeenCalled();expect(h.query).not.toHaveBeenCalled();
    });
    it.each([1, 1n, false, [], { secret: 'driver-secret' }])('rejects non-text physical count %s with indexed redaction',async(total)=>{
      const h=makeService([{rows:[]},{rows:[{total:'1'},{total}]}]);const error=await invoke(h.service).catch((caught:unknown)=>caught);
      expect(error).toBeInstanceOf(QueryRowValidationError);expect(error).toMatchObject({query:`flow.${family.name}-list.count.0`,rowIndex:1});
      expect(JSON.stringify(error)).not.toContain('driver-secret');expect(h.query).toHaveBeenCalledTimes(2);
    });
    it.each([null, false, [], 'driver-secret'])('rejects malformed wildcard row before count %s',async(row)=>{
      const h=makeService([{rows:[{},row]}]);const error=await invoke(h.service).catch((caught:unknown)=>caught);
      expect(error).toBeInstanceOf(QueryRowValidationError);expect(error).toMatchObject({query:`flow.${family.name}-list.data.0`,rowIndex:1});
      expect(JSON.stringify(error)).not.toContain('driver-secret');expect(h.query).toHaveBeenCalledOnce();
    });
    it('propagates fixed-count getter errors from validation with no data mapper exposure',async()=>{
      const error=new Error('count getter');const mapped=vi.fn();const h=makeService([{rows:[{get value(){mapped();return 1;}}]},{rows:[{get total(){throw error;}}]}]);
      await expect(invoke(h.service)).rejects.toBe(error);expect(h.query).toHaveBeenCalledTimes(2);expect(mapped).not.toHaveBeenCalled();
    });
    it('validates fixed count before exposing data while retaining one read and numeric presentation',async()=>{
      const order:string[]=[];const h=makeService([{rows:[{get opaque_value(){order.push('map');return 1;}}]},{rows:[{get total(){order.push('total');return '1';}}]}]);
      const result=await invoke(h.service);expect(result).toEqual({data:[{opaqueValue:1}],meta:{page:1,pageSize:50,total:1}});
      expect(order).toEqual(['total','map']);console.log('FLOW_PAIRED_SYNTHETIC_GETTER '+JSON.stringify({family:family.name,order}));
    });
  });
}
