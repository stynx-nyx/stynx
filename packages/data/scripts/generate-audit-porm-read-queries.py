"""Render only the 32 reviewed PORM audit read variants. No runtime SQL generation.

Run from any directory; --check compares the generated sections without writing.
Existing definitions and mapper bodies outside the named sections are preserved.
"""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[3]
FILTERS = (
    ('entity', "(schema_name || '.' || table_name) = ${index}"),
    ('operation', 'op = ${index}'),
    ('requestId', 'request_id = ${index}'),
    ('from', 'occurred_at >= ${index}::timestamptz'),
    ('to', 'occurred_at <= ${index}::timestamptz'),
)
IDS = tuple(f'audit.read-porm.mask.{mask}' for mask in range(32))

SCHEMAS = '''// ADR0034/0039: preserve mapper-owned InvalidDate and opaque nested values.
const auditPormTimestamp = z.union([text, z.instanceof(Date),
  z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const auditPormPayload = z.custom<Record<string, unknown> | unknown[] | string | number | boolean>(
  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null),
);
const auditPormTotal = z.union([text, z.bigint(), z.custom<number>((value) => typeof value === 'number')]);
const auditPormRow = z.object({
  occurred_at: auditPormTimestamp,
  op: text.nullish(), schema_name: text.nullish(), table_name: text.nullish(),
  request_id: text.nullish(), old_data: auditPormPayload.nullish(), new_data: auditPormPayload.nullish(),
  total: auditPormTotal.nullish(),
});
const auditPormLimit = z.number().min(0).max(500).refine(Number.isInteger);
// The original offset sanitizer permits integral values above MAX_SAFE_INTEGER.
const auditPormOffset = z.custom<number>((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.trunc(value) === value);
'''


def section(name, body):
    return f'// BEGIN GENERATED audit-porm32 {name}\n{body.rstrip()}\n// END GENERATED audit-porm32 {name}'


def replace_section(source, name, body, anchor):
    start = f'// BEGIN GENERATED audit-porm32 {name}'
    end = f'// END GENERATED audit-porm32 {name}'
    generated = section(name, body)
    if start in source:
        if source.count(start) != 1 or source.count(end) != 1:
            raise ValueError(f'Duplicate generated section: {name}')
        left = source.index(start)
        right = source.index(end, left) + len(end)
        return source[:left] + generated + source[right:]
    if source.count(anchor) != 1:
        raise ValueError(f'Expected unique insertion anchor: {name}')
    return source.replace(anchor, generated + '\n\n' + anchor, 1)


def operation_definition(mask):
    chosen = [(name, predicate) for bit, (name, predicate) in enumerate(FILTERS) if mask & (1 << bit)]
    clauses = [predicate.replace('{index}', str(index)) for index, (_, predicate) in enumerate(chosen, 1)]
    where = 'WHERE ' + ' AND '.join(clauses) if clauses else ''
    limit_index = len(chosen) + 1
    sql = f'''SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${{quoteIdentifierPath(i.schema)}}.${{quoteIdentifierPath(i.table)}}
      {where}
      ORDER BY occurred_at DESC
      LIMIT ${limit_index}
      OFFSET ${limit_index + 1}'''
    return f'''  '{IDS[mask]}': {{
    identifiers: auditTableIdentifiers, params: auditPormParams{len(chosen)},
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {{
      const i = auditTableIdentifiers.parse(input);
      return `{sql}`;
    }},
  }},
'''


def dispatch():
    lines = ['    let mask = 0;']
    for bit, (name, _) in enumerate(FILTERS):
        lines.extend([
            f'    let {name}: string | undefined;',
            f'    if (query.{name}) {{',
            f'      mask |= {1 << bit};',
            f'      {name} = query.{name};',
            '    }',
        ])
    lines.extend(['    const rows = await (async () => {', '      switch (mask) {'])
    for mask in range(32):
        chosen = [name for bit, (name, _) in enumerate(FILTERS) if mask & (1 << bit)]
        args = ', '.join(chosen + ['limit', 'offset'])
        lines.extend([
            f'        case {mask}:',
            f"          return (await executeConfiguredQuery(this.executor, '{IDS[mask]}', {{ schema, table }}, [{args}])).rows;",
        ])
    lines.extend(["        default: throw new TypeError('Unknown PORM audit reader filter mask');", '      }', '    })();'])
    return '\n'.join(lines)


def build_sources(root):
    registry = 'packages/data/src/configured-query.repository.ts'
    adapter = 'packages/audit/src/sql-adapter.ts'
    lint = 'tools/eslint-config/query-rules.mjs'
    sources = {path: (root / path).read_text() for path in (registry, adapter, lint)}
    tuples = ''.join(
        f"const auditPormParams{count} = z.tuple([{', '.join(['text.optional()'] * count + ['auditPormLimit', 'auditPormOffset'])}]);\n"
        for count in range(6)
    )
    sources[registry] = replace_section(sources[registry], 'schemas', SCHEMAS + tuples, '// Closed ADR0029 definitions:')
    sources[registry] = replace_section(sources[registry], 'operations', ''.join(operation_definition(mask) for mask in range(32)), "  'audit.write-table': {")

    source = sources[adapter]
    marker = '// BEGIN GENERATED audit-porm32 dispatch'
    if marker not in source:
        method = source.index('  private async listPormLoggedActions(')
        start = source.index('    const whereParts: string[] = [];', method)
        end = source.index('    return {', start)
        if source[start:end].count('await this.executor.query(querySql, params)') != 1:
            raise ValueError('Expected original PORM query boundary')
        source = source[:start] + section('dispatch', dispatch()) + '\n' + source[end:]
    else:
        source = replace_section(source, 'dispatch', dispatch(), '')
    sources[adapter] = source
    admissions = ''.join(f"  ['{operation}', new Set(['packages/audit/src/sql-adapter.ts'])],\n" for operation in IDS)
    sources[lint] = replace_section(sources[lint], 'admissions', admissions, "  ['audit.write-table', new Set(['packages/audit/src/sql-adapter.ts'])],")
    return sources


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    sources = build_sources(ROOT)
    changed = [path for path, content in sources.items() if (ROOT / path).read_text() != content]
    if args.check:
        if changed:
            raise SystemExit('Generated audit PORM sections differ: ' + ', '.join(changed))
    else:
        for path in changed:
            (ROOT / path).write_text(sources[path])
    print(f'Audit PORM: {len(IDS)} operations, {len(sources)} source outputs' + (' checked' if args.check else ' written'))


if __name__ == '__main__':
    main()
