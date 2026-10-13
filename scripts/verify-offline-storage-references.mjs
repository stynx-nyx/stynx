#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { OFFLINE_IMPORT_SCHEMA } from '../packages/offline-sync/src/import-schema.generated.ts';
import { OFFLINE_STORAGE_CATALOG } from '../packages/offline-sync/src/storage-catalog.generated.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = new Set(
  OFFLINE_STORAGE_CATALOG.entries.flatMap((entry) =>
    ['relation', 'function', 'enum'].includes(entry.kind) ? [entry.name.split('(')[0]] : [],
  ),
);
const failures = [];

// These reviewed templates consume only the schema/catalog maps checked below.
// A new or changed SQL producer requires explicit review and regression coverage.
const DYNAMIC_SQL = {
  'postgres-durable.ts': [
    'e59f5c6a2ab2a3204c19ebdcdf5b05d63427e66f6f13ffd515994692a826027e',
    'afa13b8fd72b178903b21fd41ca1fd1cd85ada238c536ae1ef59db9d5a96bb04',
    'cded115a4da52d5033779b381728c44fd05086e5f531ad8c2d29ae8494712988',
  ],
  'postgres-reconciliation.ts': [
    '7a5a7a45a03a817f36ddabec5eccd21fc4860eefa5e506f6e78b3d527d198011',
    '5a614622c06062e03dbbe3840762b437f4d022e664fa8244b2c4cf06f68181cf',
    '14b981ddeff25ceaf0d6c3a5587d39a59d1d3c995d1eca4b4ba855b880a66203',
  ],
  'postgres-listing.ts': [
    '69a3e3ce3adc4c42c8eff3ace250d94274caa667c292b9c114b9dba5faeb3609',
    'd32e73cedfa940a5bbea43d32fd2187bd6339dc3708d5706dc3f500aa6a40b7f',
    '3fc2c61db805d5f66a9e83d1675569552f26a403000e230e337a02e834c02b13',
    'ba84bdb97ec73d1ecb8f87c1bd658a5a11c736165c5b913cbd0688b022f579bc',
    '71286567826ebed08e37aad1bac2de8c1d4daed364797a3a99d2dd4a8ad26a9a',
  ],
  'postgres-offline-sync.store.ts': [
    'd04be0ea50c52ca0e94b6d982f3e9a7669a4684a77406f789d33ab3166bdbda4',
    'cecb49041221495b704ddc9e8bea50e305d8b88dde3417775e7f04d9ccbab456',
  ],
  'import-preflight.ts': [
    'cde122484f00ecbb5bc490f42b8282044b326eb497b2d1cbae3c9e7ad8318822',
    'bc28f83a9afa1790042d8e4fda278dd6b1c081abe0e41ead83bbaef26267fde0',
    '3e13f85d51c140b71dd2d8fc35d89fc5ea5fcb1888cf485a59accaca72cb2179',
    'e4363370ecb35d91c05e7c7593ffd9707db1d8e4f8146ec5cf56393238deb6a8',
    '2541661d465ee10cf42d2bdaab58644b09996d12820246a71f952fc4bd66ea9e',
    '26dc4f8b6f12b8afe04e6ef309e2dfff2f60d952d8d2f3ce36e65c797059a9b1',
  ],
  'import-state.ts': [
    '7fb4290a69fddaff77a776156308db2dc61eefb0e6e3f19b727599958e123d0e',
    'cc366ebaf6594641be6906910b4b600ec6652a5a575cda47b1433341044c9a4d',
    'c27976a0e12a9478c3220e27e1e9dc0e8d6a5af0993cc2140e86863dcf6a7f3c',
    '7e3ecba4ceeb980418460678b9adb130e92fde35a34460f451a9004edee595f0',
  ],
  'storage-invariants.ts': ['b4ef260473d038146bb2fded4318676dacc60a2aca04d80828ce96040f41c225'],
  'storage.ts': ['5125acd7e3e6fdbd0283aff5cf37e5bff9e235c614794cfde365dfe425aafc95'],
};

// The entire producer binding is frozen too: unchanged SQL text cannot admit
// identifiers from a newly changed, unreviewed data source.
const DYNAMIC_PRODUCER_SOURCES = {
  'listing.ts': '160347fb814a76c5ec5d09a553852b4538299865adb7dfb3e8e318e33a5e46d2',
  'stynx-context.ts': 'cff6d850b59b0b6309c0242839f8bfd5a67a425976e036908929723d1fe5df1f',

  'import-preflight.ts': 'a079ab03949aba9cd8fec29a8c2245f56f7b03ad16200815a92fbe68c544c962',
  'import-state.ts': '15b7597d57df3a8d9f176f6b5a4799c8ac5af41ef01cff25852a6b63d9783493',
  'storage-invariants.ts': '0482be3f6e8b54e64d7709c6328bd4077c46143c2cfc6cef79d83a749661c302',
  'storage.ts': 'b452fa9bbc9c58c72eda7eac206f19b32a670fb3bf39e82847124af77d82cd8a',
  'postgres-reconciliation.ts': '67e1fc701ea76cc2b46915daf5a11211dda456f98fdecc1b62513df64a3b3a86',
  'postgres-durable.ts': '0eb59fbfd6972029a98fab44518142e27a7a187bba0ee9981c1540fa7977547e',
  'postgres-listing.ts': '642ea1b2aefdc19f361d2eeb4c75ac40723418e662b7ca2ff14334db3c87d646',
  'postgres-offline-sync.store.ts':
    '73a6c123b52d16fc19c613ab33f9da1e39b76824b1066900b04e68a55a342dee',
};

const require = createRequire(resolve(root, 'node_modules/.pnpm/node_modules/_.js'));
const { default: PgQuery } = await import(require.resolve('pg-query-emscripten'));
const parser = await new PgQuery();
const columns = new Map();
for (const entry of OFFLINE_STORAGE_CATALOG.entries) {
  if (entry.kind !== 'column') continue;
  const [table, column] = entry.name.split('.');
  if (!columns.has(table)) columns.set(table, new Set());
  columns.get(table).add(column);
}
for (const entry of OFFLINE_STORAGE_CATALOG.entries) {
  if (entry.kind === 'sequence')
    columns.set(entry.name, new Set(['last_value', 'log_cnt', 'is_called']));
}
function metadata(file, name) {
  const source = ts.createSourceFile(
    file,
    readFileSync(resolve(root, 'packages/offline-sync/src', file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let found;
  const value = (node) => {
    if (ts.isAsExpression(node)) return value(node.expression);
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value);
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties.map((property) => {
          if (
            !ts.isPropertyAssignment(property) ||
            (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
          )
            throw new Error('Closed SQL metadata must be literal');
          return [property.name.text, value(property.initializer)];
        }),
      );
    throw new Error('Closed SQL metadata must be literal');
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
      found = value(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`Missing SQL metadata ${file}:${name}`);
  return found;
}
function nullable(rule) {
  if (rule.$ref) return nullable(OFFLINE_IMPORT_SCHEMA.$defs[rule.$ref.split('/').at(-1)]);
  if (rule.anyOf || rule.oneOf) return (rule.anyOf ?? rule.oneOf).some(nullable);
  return rule.type === 'null' || (Array.isArray(rule.type) && rule.type.includes('null'));
}
const importRelations = metadata('import-validation.ts', 'IMPORT_RELATIONS');
const importKeys = metadata('import-validation.ts', 'IMPORT_KEYS');
for (const [kind, table] of Object.entries(importRelations)) {
  if (!columns.has(table)) failures.push(`Unknown import table ${table}`);
  const row = OFFLINE_IMPORT_SCHEMA.$defs[`${kind}Row`];
  if (!row?.properties) {
    failures.push(`Missing import row ${kind}`);
    continue;
  }
  const projected = Object.keys(row.properties).map((column) =>
    column === 'response_body_base64' ? 'response_body_bytes' : column,
  );
  const actual = [...(columns.get(table) ?? [])].filter(
    (column) => column !== 'response_body_is_archived',
  );
  if (projected.sort().join(',') !== actual.sort().join(','))
    failures.push(`Import column projection differs from closed catalog: ${table}`);
  for (const [sourceColumn, rule] of Object.entries(row.properties)) {
    const target = sourceColumn === 'response_body_base64' ? 'response_body_bytes' : sourceColumn;
    const column = OFFLINE_STORAGE_CATALOG.entries.find(
      (entry) => entry.kind === 'column' && entry.name === `${table}.${target}`,
    );
    if (column && nullable(rule) === column.value.notNull)
      failures.push(`Import nullable projection differs from closed catalog: ${table}.${target}`);
  }
  const pk = OFFLINE_STORAGE_CATALOG.entries.find(
    (entry) =>
      entry.kind === 'constraint' && entry.name.startsWith(`${table}.`) && entry.value.kind === 'p',
  );
  if (!pk || JSON.stringify(pk.value.columns) !== JSON.stringify(importKeys[kind]))
    failures.push(`Import primary-key projection differs: ${table}`);
}
const instantProjection = metadata('storage-invariants.ts', 'instantColumns');
const expectedInstants = OFFLINE_STORAGE_CATALOG.entries
  .filter(
    (entry) =>
      entry.kind === 'column' &&
      entry.value.type === 'timestamptz' &&
      !entry.name.startsWith('sync_import_receipts.'),
  )
  .map((entry) => entry.name)
  .sort();
const actualInstants = Object.entries(instantProjection)
  .flatMap(([table, instants]) => instants.map((column) => `${table}.${column}`))
  .sort();
if (JSON.stringify(actualInstants) !== JSON.stringify(expectedInstants))
  failures.push('Persisted instant projection differs from exact closed timestamp catalog');

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else walk(child, visit);
  }
}
const checkedSQL = new Set();
function checkSql(sql, file) {
  if (checkedSQL.has(sql)) return;
  checkedSQL.add(sql);
  if (
    !/(?:\boffline|"offline")\s*\./iu.test(sql) ||
    !/^\s*(?:select|insert|update|delete|with|lock)\b/iu.test(sql)
  )
    return;
  let parsed = parser.parse(sql);
  // A reusable CTE prefix has no final statement until the caller appends it.
  if (parsed.error && /^\s*with\b/iu.test(sql)) {
    const prefix = parser.parse(`${sql} select 1`);
    if (!prefix.error) parsed = prefix;
  }
  if (parsed.error) {
    failures.push(`${file}: SQL parsing failed: ${parsed.error.message} [${sql}]`);
    return;
  }
  const scopedWalk = (value, inherited = new Map()) => {
    if (!value || typeof value !== 'object') return;
    const statement =
      value.SelectStmt ??
      value.InsertStmt ??
      value.UpdateStmt ??
      value.DeleteStmt ??
      (typeof value.op === 'string' && value.op.startsWith('SETOP_') ? value : undefined);
    if (!statement) {
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach((item) => scopedWalk(item, inherited));
        else scopedWalk(child, inherited);
      }
      return;
    }
    const aliases = new Map(inherited),
      relations = new Set(),
      outputNames = new Set();
    const localWalk = (node, visit) => {
      if (!node || typeof node !== 'object') return;
      if (
        node !== statement &&
        (node.SelectStmt ||
          node.InsertStmt ||
          node.UpdateStmt ||
          node.DeleteStmt ||
          (typeof node.op === 'string' && node.op.startsWith('SETOP_')))
      )
        return;
      visit(node);
      for (const child of Object.values(node)) {
        if (Array.isArray(child)) child.forEach((item) => localWalk(item, visit));
        else localWalk(child, visit);
      }
    };
    const relation = (item) => {
      if (item.schemaname === 'offline') {
        if (!names.has(item.relname))
          failures.push(`${file}: unknown offline object ${item.relname}`);
        aliases.set(item.alias?.aliasname ?? item.relname, item.relname);
        relations.add(item.relname);
      }
    };
    if (statement.relation) relation(statement.relation);
    localWalk(statement, (node) => {
      if (node.RangeVar) relation(node.RangeVar);
      if (node.ResTarget?.name) outputNames.add(node.ResTarget.name);
    });
    const aliasReferences = new Set();
    for (const clause of [statement.sortClause, statement.groupClause])
      walk(clause, (node) => {
        if (node.ColumnRef) aliasReferences.add(node.ColumnRef);
      });
    localWalk(statement, (node) => {
      if (node.ColumnRef) {
        const fields = node.ColumnRef.fields;
        if (fields.some((field) => field.A_Star)) return;
        const parts = fields.map((field) => field.String?.sval);
        const table =
          parts.length === 3 && parts[0] === 'offline'
            ? parts[1]
            : parts.length === 2
              ? aliases.get(parts[0])
              : null;
        const column = parts.at(-1);
        if (table && !columns.get(table)?.has(column))
          failures.push(`${file}: unknown offline column ${table}.${column}`);
        if (
          parts.length === 1 &&
          aliases.size > 0 &&
          !(aliasReferences.has(node.ColumnRef) && outputNames.has(column))
        ) {
          if (
            ![...new Set(aliases.values())].some((relation) => columns.get(relation)?.has(column))
          )
            failures.push(`${file}: unknown offline input column ${column}`);
        }
      }
    });
    if (statement.relation?.schemaname === 'offline')
      for (const target of statement.cols ?? statement.targetList ?? []) {
        const column = target.ResTarget?.name;
        if (column && !columns.get(statement.relation.relname)?.has(column))
          failures.push(`${file}: unknown offline column ${statement.relation.relname}.${column}`);
      }
    // Nested statements have their own aliases and may correlate to this scope.
    for (const child of Object.values(statement)) {
      if (Array.isArray(child)) child.forEach((item) => scopedWalk(item, aliases));
      else scopedWalk(child, aliases);
    }
  };
  scopedWalk(parsed.parse_tree);
  walk(parsed.parse_tree, (node) => {
    if (!node.FuncCall) return;
    const parts = node.FuncCall.funcname.map((part) => part.String?.sval);
    if (parts[0] !== 'offline') return;
    const arity = node.FuncCall.args?.length ?? 0;
    const matches = OFFLINE_STORAGE_CATALOG.entries.filter(
      (entry) => entry.kind === 'function' && entry.name.startsWith(`${parts[1]}(`),
    );
    if (
      !matches.some((entry) => {
        const args = entry.name.slice(entry.name.indexOf('(') + 1, -1);
        return (args ? args.split(',').length : 0) === arity;
      })
    )
      failures.push(`${file}: unknown offline function signature ${parts[1]}/${arity}`);
  });
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : entry.name.endsWith('.ts') && !entry.name.endsWith('.generated.ts')
        ? [path]
        : [];
  });
}
for (const source of OFFLINE_STORAGE_CATALOG.sources) {
  const digest = createHash('sha256')
    .update(readFileSync(resolve(root, source.path)))
    .digest('hex');
  if (digest !== source.sha256) failures.push(`Manifest source drift: ${source.path}`);
}
const dir = resolve(root, 'packages/offline-sync/src');
for (const file of files(dir)) {
  const text = readFileSync(file, 'utf8');
  const producer = DYNAMIC_PRODUCER_SOURCES[basename(file)];
  if (producer && createHash('sha256').update(text).digest('hex') !== producer)
    failures.push(`${file}: dynamic SQL producer source changed without review`);
  const program = ts.createProgram([file], { noResolve: true, noLib: true });
  const source = program.getSourceFile(file);
  const checker = program.getTypeChecker();
  const declaration = (node) => {
    const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
    if (declarations.length !== 1) return null;
    const candidate = declarations[0];
    if (
      !ts.isVariableDeclaration(candidate) ||
      !ts.isIdentifier(candidate.name) ||
      !ts.isVariableDeclarationList(candidate.parent) ||
      !(candidate.parent.flags & ts.NodeFlags.Const)
    )
      return null;
    return candidate.initializer ?? null;
  };
  const literal = (node, seen = new Set()) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node)) {
      const value = declaration(node);
      if (value && !seen.has(value)) return literal(value, new Set([...seen, value]));
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = literal(node.left, seen),
        right = literal(node.right, seen);
      return left === null || right === null ? null : left + right;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = literal(span.expression, seen);
        if (part === null) return null;
        value += part + span.literal.text;
      }
      return value;
    }
    return null;
  };
  const queryMember = (node) =>
    (ts.isPropertyAccessExpression(node) && node.name.text === 'query') ||
    (ts.isElementAccessExpression(node) && literal(node.argumentExpression) === 'query');
  const visit = (node) => {
    if (ts.isCallExpression(node) && queryMember(node.expression)) {
      const argument = node.arguments[0];
      const sql = argument ? literal(argument) : null;
      if (sql !== null) checkSql(sql, file);
      else if (!producer) failures.push(`${file}: unresolved unregistered query producer`);
    }
    if (
      !producer &&
      ts.isCallExpression(node) &&
      ts.isElementAccessExpression(node.expression) &&
      literal(node.expression.argumentExpression) === null
    )
      failures.push(`${file}: unsupported computed invocation`);
    if (
      !producer &&
      queryMember(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    )
      failures.push(`${file}: unsupported extracted query method`);
    if (
      !producer &&
      ts.isBindingElement(node) &&
      ((node.propertyName &&
        (((ts.isIdentifier(node.propertyName) || ts.isStringLiteral(node.propertyName)) &&
          node.propertyName.text === 'query') ||
          (ts.isComputedPropertyName(node.propertyName) &&
            literal(node.propertyName.expression) === 'query'))) ||
        (!node.propertyName && ts.isIdentifier(node.name) && node.name.text === 'query'))
    )
      failures.push(`${file}: unsupported extracted query method`);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !ts.isBinaryExpression(node.parent)
    ) {
      const value = literal(node);
      if (value !== null) checkSql(value, file);
      else if (/offline\s*\./iu.test(node.getText(source)))
        failures.push(`${file}: unregistered dynamic offline SQL reference`);
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node)
    ) {
      const pieces = ts.isTemplateExpression(node)
        ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
        : [node.text];
      const sql = pieces.join('__DYNAMIC__');
      if (/^\.{1,2}\//u.test(sql)) return;
      for (const match of sql.matchAll(
        /(?:\boffline|"offline")\s*\.\s*(?:"([^"]+)"|([a-z_][a-z0-9_]*)(?![a-z0-9_-]))/giu,
      )) {
        const name = match[1] ?? match[2].toLowerCase();
        if (name.includes('__dynamic__') || name.includes('__DYNAMIC__')) continue;
        if (!names.has(name)) failures.push(`${file}: unknown offline object ${name}`);
      }
      const complete = literal(node);
      if (complete !== null && !ts.isBinaryExpression(node.parent)) checkSql(complete, file);
      if (
        ts.isTemplateExpression(node) &&
        complete === null &&
        /^(?:\s*(?:select|insert|update|delete|with|lock|alter|grant|revoke)\b|__DYNAMIC__\s+as\s*\(select)/iu.test(
          sql,
        )
      ) {
        const digest = createHash('sha256').update(node.getText(source)).digest('hex');
        if (!DYNAMIC_SQL[basename(file)]?.includes(digest))
          failures.push(`${file}: unregistered dynamic offline SQL producer ${digest}`);
        else if (
          [
            'postgres-listing.ts',
            'postgres-durable.ts',
            'postgres-offline-sync.store.ts',
            'postgres-reconciliation.ts',
          ].includes(basename(file))
        ) {
          let variants = [node.head.text];
          for (const span of node.templateSpans) {
            let replacements;
            if (
              ts.isCallExpression(span.expression) &&
              ts.isIdentifier(span.expression.expression) &&
              ['pgSortInstant', 'mergeStynxSql'].includes(span.expression.expression.text) &&
              ts.isStringLiteral(span.expression.arguments[0])
            )
              replacements = [span.expression.arguments[0].text];
            else if (
              ts.isConditionalExpression(span.expression) &&
              ts.isStringLiteral(span.expression.whenTrue) &&
              ts.isStringLiteral(span.expression.whenFalse)
            )
              replacements = [span.expression.whenTrue.text, span.expression.whenFalse.text];
            else {
              failures.push(`${file}: unsupported registered SQL expansion`);
              replacements = ['__UNSUPPORTED__'];
            }
            variants = variants.flatMap((prefix) =>
              replacements.map((replacement) => prefix + replacement + span.literal.text),
            );
          }
          variants.forEach((variant) => checkSql(variant, file));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (failures.length) throw new Error(failures.join('\n'));
process.stdout.write('Offline runtime references and manifest sources agree.\n');
