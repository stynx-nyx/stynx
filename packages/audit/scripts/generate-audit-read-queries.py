"""Generate the reviewed remaining audit128+128+256 literal definitions.
No runtime SQL generation. --check is read-only. Initial PORM sections stay intact.
"""
from pathlib import Path
import argparse
ROOT = Path(__file__).resolve().parents[3]
TEMPLATES = {'log': 'SELECT\n        occurred_at,\n        tenant_id,\n        actor_id,\n        operation,\n        table_schema,\n        table_name,\n        row_id,\n        request_id,\n        tags,\n        payload,\n        COUNT(*) OVER() AS total\n      FROM ${schema}.${table}\n      ${whereSql}\n      ORDER BY occurred_at DESC, id DESC\n      LIMIT $${index++}\n      OFFSET $${index}', 'events': 'SELECT\n        occurred_at,\n        tenancy_id,\n        actor_id,\n        actor_role,\n        operation,\n        entity,\n        entity_id,\n        pk,\n        request_id,\n        ip_address,\n        metadata,\n        old_data,\n        new_data,\n        previous_hash,\n        row_hash,\n        COUNT(*) OVER() AS total\n      FROM ${schema}.${table}\n      ${whereSql}\n      ORDER BY occurred_at DESC\n      LIMIT $${index++}\n      OFFSET $${index}', 'service': "\n            select\n              id,\n              occurred_at,\n              table_schema,\n              table_name,\n              row_id,\n              operation,\n              tenant_id,\n              actor_id,\n              request_id,\n              session_id,\n              tags,\n              payload\n            from audit.log\n            ${whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : ''}\n            order by occurred_at desc, id desc\n            limit $${index}\n          "}
FILTERS = (
    ('tenantId', 'tenant_id::text = $N'), ('entity', "(table_schema || '.' || table_name) = $N"),
    ('operation', 'operation = $N'), ('actorId', 'actor_id::text = $N'),
    ('requestId', 'request_id = $N'), ('from', 'occurred_at >= $N::timestamptz'),
    ('to', 'occurred_at <= $N::timestamptz'),
)
SERVICE_FILTERS = (
    ('tenantId', 'tenant_id::text = $N'), ('actorId', 'actor_id::text = $N'),
    ('tableSchema', 'table_schema = $N'), ('tableName', 'table_name = $N'),
    ('rowId', 'row_id = $N'), ('from', 'occurred_at >= $N::timestamptz'),
    ('to', 'occurred_at <= $N::timestamptz'),
)
CONFIGURED_SCHEMAS = '''const auditLogReadRow = z.object({
  occurred_at: auditPormTimestamp,
  tenant_id: text.nullish(), actor_id: text.nullish(), operation: text.nullish(),
  table_schema: text.nullish(), table_name: text.nullish(), row_id: text.nullish(),
  request_id: text.nullish(), tags: auditPormPayload.nullish(), payload: auditPormPayload.nullish(),
  total: auditPormTotal.nullish(),
});
const auditEventsReadRow = z.object({
  occurred_at: auditPormTimestamp,
  tenancy_id: text.nullish(), actor_id: text.nullish(), actor_role: text.nullish(),
  operation: text.nullish(), entity: text.nullish(), entity_id: text.nullish(),
  pk: auditPormPayload.nullish(), request_id: text.nullish(), ip_address: text.nullish(),
  metadata: auditPormPayload.nullish(), old_data: auditPormPayload.nullish(), new_data: auditPormPayload.nullish(),
  previous_hash: text.nullish(), row_hash: text.nullish(), total: auditPormTotal.nullish(),
});
'''
STATIC_SCHEMAS = '''import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const timestamp = z.union([text, z.instanceof(Date),
  z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const opaque = z.custom<Record<string, unknown> | unknown[] | string | number | boolean>(
  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null),
);
const numeric = z.custom<number>((value) => typeof value === 'number');
const auditLogRow = z.object({
  id: z.union([text, numeric]), occurred_at: timestamp,
  table_schema: text, table_name: text, row_id: text.nullable(), operation: text,
  tenant_id: text.nullable(), actor_id: text.nullable(), request_id: text.nullable(),
  session_id: text.nullable(), tags: opaque.nullish(), payload: opaque.nullish(),
});
export type AuditLogReadRow = z.output<typeof auditLogRow>;
'''
PAYLOAD_HELPER = '''type AuditOpaqueValue = Record<string, unknown> | unknown[] | string | number | boolean;

function isAuditOpaqueValue(value: unknown): value is AuditOpaqueValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null);
}

function readAuditPayloadField(
  payload: AuditOpaqueValue | null | undefined,
  key: 'old' | 'new',
  rowIndex: number,
  mask: number,
): AuditOpaqueValue | null {
  if (payload === null || payload === undefined) return null;
  const target: unknown = Object(payload);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    const value: unknown = Reflect.get(target, key, payload);
    if (value === null || value === undefined) return null;
    if (isAuditOpaqueValue(value)) return value;
  }
  throw new QueryRowValidationError(`configured.audit.read-log.mask.${mask}`, rowIndex,
    [{ path: ['payload', key], code: 'invalid_type' }]);
}
'''

def section(name, body):
    return f'// BEGIN GENERATED audit-remaining512 {name}\n{body.rstrip()}\n// END GENERATED audit-remaining512 {name}'

def replace_section(source, name, body, anchor):
    start=f'// BEGIN GENERATED audit-remaining512 {name}'
    end=f'// END GENERATED audit-remaining512 {name}'
    generated=section(name,body)
    if start in source:
        if source.count(start)!=1 or source.count(end)!=1: raise ValueError(name)
        left=source.index(start);right=source.index(end,left)+len(end)
        return source[:left]+generated+source[right:]
    if source.count(anchor)!=1: raise ValueError(f'Expected unique anchor: {name}')
    return source.replace(anchor,generated+'\n\n'+anchor,1)

def chosen(filters,mask):
    return [entry for bit,entry in enumerate(filters) if mask & (1<<bit)]

def configured_parts(family):
    filters=list(FILTERS)
    if family=='events': filters[0]=('tenantId','tenancy_id::text = $N');filters[1]=('entity','entity = $N')
    definitions=[];calls=[];admissions=[]
    for mask in range(128):
        selected=chosen(filters,mask)
        predicates=[p.replace('$N',f'${i}') for i,(_,p) in enumerate(selected,1)]
        sql=TEMPLATES[family].replace('${schema}.${table}','${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}')
        sql=sql.replace('${whereSql}','WHERE '+' AND '.join(predicates) if predicates else '')
        sql=sql.replace('$${index++}',f'${len(selected)+1}').replace('$${index}',f'${len(selected)+2}')
        op=f'audit.read-{family}.mask.{mask}';row='auditLogReadRow' if family=='log' else 'auditEventsReadRow'
        definitions.append(f"  '{op}': {{\n    identifiers: auditTableIdentifiers, params: auditReaderParams{len(selected)},\n    row: {row}, expects: 'many', legacyAuditReadResult: true,\n    render: (input: unknown): string => {{\n      const i = auditTableIdentifiers.parse(input);\n      return `{sql}`;\n    }},\n  }},\n")
        args=', '.join([name for name,_ in selected]+['limit','offset'])
        calls.append(f"        case {mask}: return (await executeConfiguredQuery(this.executor, '{op}', {{ schema, table }}, [{args}])).rows;")
        admissions.append(f"  ['{op}', new Set(['packages/audit/src/sql-adapter.ts'])],\n")
    lines=['    let mask = 0;']
    for bit,(name,_) in enumerate(filters):
        lines.extend([f'    let {name}: string | undefined;',f'    if (query.{name}) {{',f'      mask |= {1<<bit};',f'      {name} = query.{name};','    }'])
    lines.extend(['    const rows = await (async () => {','      switch (mask) {',*calls,f"        default: throw new TypeError('Unknown {family} audit reader filter mask');",'      }','    })();'])
    return ''.join(definitions),'\n'.join(lines),''.join(admissions)

def static_parts():
    schemas=STATIC_SCHEMAS
    for count in range(8):
        for cursor in [False,True]:
            params=['text.optional()']*count+(['z.unknown()','z.unknown()'] if cursor else [])+['numeric']
            schemas+=f"const auditLogParams{count}{'Cursor' if cursor else ''} = z.tuple([{', '.join(params)}]);\n"
    definitions=[];calls=[]
    for mask in range(256):
        selected=chosen(SERVICE_FILTERS,mask)
        predicates=[p.replace('$N',f'${i}') for i,(_,p) in enumerate(selected,1)]
        args=[name for name,_ in selected]
        if mask&128:
            predicates.append(f'(occurred_at, id) < (${len(args)+1}::timestamptz, ${len(args)+2}::bigint)')
            args.extend(['cursorOccurredAt','cursorId'])
        sql=TEMPLATES['service'].replace("${whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : ''}",'where '+' and '.join(predicates) if predicates else '')
        sql=sql.replace('$${index}',f'${len(args)+1}')
        if '${' in sql: raise ValueError('Unresolved static interpolation')
        name=f'auditLogRead{mask}'
        definitions.append(f"export const {name} = defineQuery({{\n name: 'audit.listLog.mask.{mask}', text: sql`{sql}`,\n params: auditLogParams{len(selected)}{'Cursor' if mask&128 else ''}, row: auditLogRow, expects: 'many',\n}});\n")
        calls.append(f"            case {mask}: return trx.run(auditLogReads.{name}, [{', '.join(args+['limit + 1'])}]);")
    lines=['        let mask = 0;']
    for bit,(name,_) in enumerate(SERVICE_FILTERS):
        lines.extend([f'        let {name}: string | undefined;',f'        if (query.{name}) {{',f'          mask |= {1<<bit};',f'          {name} = query.{name};','        }'])
    lines.extend(['        let cursorOccurredAt: unknown;','        let cursorId: unknown;','        if (cursor) {','          mask |= 128;',"          cursorOccurredAt = cursorField(cursor, 'occurredAt');","          cursorId = cursorField(cursor, 'id');",'        }','        const rows = await (async () => {','          switch (mask) {',*calls,"            default: throw new TypeError('Unknown audit log filter mask');",'          }','        })();'])
    return schemas+'\n'+''.join(definitions),'\n'.join(lines)

def build_sources(root):
    paths=['packages/data/src/configured-query.repository.ts','packages/audit/src/sql-adapter.ts','tools/eslint-config/query-rules.mjs','packages/audit/src/audit.service.ts']
    sources={p:(root/p).read_text() for p in paths}
    registry,adapter,lint,service=paths
    tuples=''.join(f"const auditReaderParams{count} = z.tuple([{', '.join(['text.optional()']*count+['auditPormLimit','auditPormOffset'])}]);\n" for count in range(8))
    sources[registry]=replace_section(sources[registry],'schemas',CONFIGURED_SCHEMAS+tuples,'// Closed ADR0029 definitions:')
    for family,method in [('log','listAuditLog'),('events','listStynxEvents')]:
        definitions,dispatch,admissions=configured_parts(family)
        sources[registry]=replace_section(sources[registry],family+'-operations',definitions,"  'audit.write-table': {")
        sources[lint]=replace_section(sources[lint],family+'-admissions',admissions,"  ['audit.write-table', new Set(['packages/audit/src/sql-adapter.ts'])],")
        source=sources[adapter];marker=f'// BEGIN GENERATED audit-remaining512 {family}-dispatch'
        if marker in source: source=replace_section(source,family+'-dispatch',dispatch,'')
        else:
            start=source.index('    const whereParts: string[] = [];',source.index(f'  private async {method}('))
            end=source.index('    return {',start)
            source=source[:start]+section(family+'-dispatch',dispatch)+'\n'+source[end:]
        sources[adapter]=source
    source=sources[adapter]
    if 'type SelectRow = {' in source:
        start=source.index('type SelectRow = {');end=source.index('function toIso(',start)
        source=source[:start]+PAYLOAD_HELPER+'\n'+source[end:]
        source=source.replace('executeTypedQuery }', 'executeTypedQuery, QueryRowValidationError }',1)
        method=source.index('  private async listAuditLog(');end=source.index('  private async listStynxEvents(',method)
        body=source[method:end].replace('items: rows.map((row) => ({','items: rows.map((row, rowIndex) => ({',1)
        body=body.replace('(row.payload?.old ?? null) as Record<string, unknown> | null',"readAuditPayloadField(row.payload, 'old', rowIndex, mask)")
        body=body.replace('(row.payload?.new ?? null) as Record<string, unknown> | null',"readAuditPayloadField(row.payload, 'new', rowIndex, mask)")
        source=source[:method]+body+source[end:]
    sources[adapter]=source
    static,dispatch=static_parts()
    sources['packages/audit/src/audit-log-read.repository.ts']=static
    source=sources[service];marker='// BEGIN GENERATED audit-remaining512 service-dispatch'
    if marker in source: source=replace_section(source,'service-dispatch',dispatch,'')
    else:
        start=source.index('        const whereParts: string[] = [];',source.index('  async listLog('))
        end=source.index('        const items = ',start)
        source=source[:start]+section('service-dispatch',dispatch)+'\n\n'+source[end:]
        source=source.replace('rows.rows.slice(0, limit)','rows.slice(0, limit)',1).replace('const tail = rows.rows[limit]','const tail = rows[limit]',1)
        start=source.index('interface AuditLogRow {');end=source.index('interface AuditChainRow {',start)
        source=source[:start]+source[end:]
        source=source.replace('private mapLogRow(row: AuditLogRow)', 'private mapLogRow(row: auditLogReads.AuditLogReadRow)',1)
        source="import * as auditLogReads from './audit-log-read.repository.js';\n"+source
    sources[service]=source
    return sources

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    sources=build_sources(ROOT);changed=[p for p,s in sources.items() if not (ROOT/p).exists() or (ROOT/p).read_text()!=s]
    if args.check:
        if changed: raise SystemExit('Generated audit sections differ: '+', '.join(changed))
    else:
        for p in changed:
            (ROOT/p).parent.mkdir(parents=True,exist_ok=True);(ROOT/p).write_text(sources[p])
    print('Remaining audit: 256 configured operations + 256 static definitions; '+str(len(sources))+' outputs')

if __name__=='__main__': main()
