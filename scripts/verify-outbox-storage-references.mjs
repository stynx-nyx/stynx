#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { OUTBOX_STORAGE_CATALOG } from '../packages/outbox/src/storage-catalog.generated.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = new Set(
  OUTBOX_STORAGE_CATALOG.entries.flatMap((entry) =>
    ['relation', 'function', 'enum'].includes(entry.kind) ? [entry.name.split('(')[0]] : [],
  ),
);
const failures = [];
const require = createRequire(resolve(root, 'node_modules/.pnpm/node_modules/_.js'));
const { default: PgQuery } = await import(require.resolve('pg-query-emscripten'));
const parser = await new PgQuery();
const columns = new Map();
for (const entry of OUTBOX_STORAGE_CATALOG.entries) {
  if (entry.kind !== 'column') continue;
  const [table, column] = entry.name.split('.');
  if (!columns.has(table)) columns.set(table, new Set());
  columns.get(table).add(column);
}
for (const entry of OUTBOX_STORAGE_CATALOG.entries) {
  if (entry.kind === 'sequence')
    columns.set(entry.name, new Set(['last_value', 'log_cnt', 'is_called']));
}
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach((item) => walk(item, visit));
    else walk(child, visit);
  }
}
function checkSql(sql, file) {
  if (
    !/(?:\boutbox|"outbox")\s*\./iu.test(sql) ||
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
  const aliases = new Map();
  const relations = new Set();
  const outputNames = new Set();
  let external = false;
  walk(parsed.parse_tree, (node) => {
    if (node.RangeVar) {
      const relation = node.RangeVar;
      if (relation.schemaname === 'outbox') {
        if (!names.has(relation.relname))
          failures.push(`${file}: unknown outbox object ${relation.relname}`);
        aliases.set(relation.alias?.aliasname ?? relation.relname, relation.relname);
        relations.add(relation.relname);
      } else external = true;
    }
    if (node.ResTarget?.name) outputNames.add(node.ResTarget.name);
  });
  walk(parsed.parse_tree, (node) => {
    if (node.ColumnRef) {
      const fields = node.ColumnRef.fields;
      if (fields.some((field) => field.A_Star)) return;
      const parts = fields.map((field) => field.String?.sval);
      const table =
        parts.length === 3 && parts[0] === 'outbox'
          ? parts[1]
          : parts.length === 2
            ? aliases.get(parts[0])
            : null;
      const column = parts.at(-1);
      if (table && !columns.get(table)?.has(column))
        failures.push(`${file}: unknown outbox column ${table}.${column}`);
      if (parts.length === 1 && relations.size === 1 && !external && !outputNames.has(column)) {
        const only = [...relations][0];
        if (!columns.get(only)?.has(column))
          failures.push(`${file}: unknown outbox column ${only}.${column}`);
      }
    }
    for (const kind of ['InsertStmt', 'UpdateStmt']) {
      const statement = node[kind];
      if (statement?.relation?.schemaname !== 'outbox') continue;
      const table = statement.relation.relname;
      for (const target of statement.cols ?? statement.targetList ?? []) {
        const column = target.ResTarget?.name;
        if (column && !columns.get(table)?.has(column))
          failures.push(`${file}: unknown outbox column ${table}.${column}`);
      }
    }
    if (node.FuncCall) {
      const parts = node.FuncCall.funcname.map((part) => part.String?.sval);
      if (parts[0] !== 'outbox') return;
      const arity = node.FuncCall.args?.length ?? 0;
      const matches = OUTBOX_STORAGE_CATALOG.entries.filter(
        (entry) => entry.kind === 'function' && entry.name.startsWith(`${parts[1]}(`),
      );
      if (
        !matches.some((entry) => {
          const args = entry.name.slice(entry.name.indexOf('(') + 1, -1);
          return (args ? args.split(',').length : 0) === arity;
        })
      )
        failures.push(`${file}: unknown outbox function signature ${parts[1]}/${arity}`);
    }
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
for (const source of OUTBOX_STORAGE_CATALOG.sources) {
  const digest = createHash('sha256')
    .update(readFileSync(resolve(root, source.path)))
    .digest('hex');
  if (digest !== source.sha256) failures.push(`Manifest source drift: ${source.path}`);
}
const dir = resolve(root, 'packages/outbox/src');
for (const file of files(dir)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declarations = new Map();
  const register = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, register);
  };
  register(source);
  const literal = (node, seen = new Set()) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text))
      return literal(declarations.get(node.text), new Set([...seen, node.text]));
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
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !ts.isBinaryExpression(node.parent)
    ) {
      const value = literal(node);
      if (value !== null) checkSql(value, file);
      else if (/outbox\s*\./iu.test(node.getText(source)))
        failures.push(`${file}: unregistered dynamic outbox SQL reference`);
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
        /(?:\boutbox|"outbox")\s*\.\s*(?:"([^"]+)"|([a-z_][a-z0-9_]*))/giu,
      )) {
        const name = match[1] ?? match[2].toLowerCase();
        if (name.includes('__dynamic__') || name.includes('__DYNAMIC__')) continue;
        if (!names.has(name)) failures.push(`${file}: unknown outbox object ${name}`);
      }
      const complete = literal(node);
      if (complete !== null && !ts.isBinaryExpression(node.parent)) checkSql(complete, file);
      // The sole dynamically qualified SQL relation is a cutover lock over
      // a locally declared, closed literal list. Reporting labels are not SQL.
      if (
        ts.isTemplateExpression(node) &&
        complete === null &&
        /\b(?:select|insert|update|delete|lock|alter|grant|revoke)\b/iu.test(sql)
      ) {
        node.templateSpans.forEach((span, index) => {
          const previous =
            index === 0 ? node.head.text : node.templateSpans[index - 1].literal.text;
          if (!/(?:outbox|"outbox")\s*\.\s*"?$/iu.test(previous)) return;
          if (
            node.head.text !== 'lock table outbox.' ||
            !ts.isIdentifier(span.expression) ||
            span.expression.text !== 'target'
          ) {
            failures.push(`${file}: unregistered dynamic outbox SQL reference`);
            return;
          }
          const declaration = text.match(/const targets = \[([^\]]+)\]/u);
          const targets = declaration?.[1].match(/'([^']+)'/gu)?.map((item) => item.slice(1, -1));
          if (!targets?.length || targets.some((name) => !names.has(name)))
            failures.push(`${file}: cutover targets outside closed inventory`);
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (failures.length) throw new Error(failures.join('\n'));
process.stdout.write('Outbox runtime references and manifest sources agree.\n');
