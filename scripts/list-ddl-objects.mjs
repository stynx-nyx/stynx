#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDdlDir = 'db/ddl';

if (isMain()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const objects = collectDdlObjects({ repoRoot, ddlDir: args.ddlDir });
    process.stdout.write(formatCsv(objects));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

export function collectDdlObjects(options = {}) {
  const root = resolve(options.repoRoot ?? repoRoot);
  const ddlDir = join(root, options.ddlDir ?? defaultDdlDir);
  if (!existsSync(ddlDir)) return [];

  const files = readdirSync(ddlDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => join(ddlDir, entry));

  return files
    .flatMap((file) => parseDdlFile(file, root))
    .sort(compareDdlObjects);
}

export function parseDdlFile(file, root = repoRoot) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const sourceFile = relative(root, file);
  const objects = [];
  let searchPathSchema = 'public';

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripSqlLineComment(lines[index]).trim();
    if (!line) continue;

    const searchPathMatch = line.match(/^SET\s+search_path\s+TO\s+(.+?);?$/i);
    if (searchPathMatch) {
      searchPathSchema = firstSearchPathSchema(searchPathMatch[1]) ?? searchPathSchema;
      continue;
    }

    const extension = matchExtension(line);
    if (extension) {
      objects.push(buildObject({ schema: 'public', name: extension.name, type: 'extension', sourceFile, line: lineNumber }));
      continue;
    }

    const functionObject = matchNamedObject(line, /^CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(.+?)\s*\(/i, 'function', searchPathSchema);
    if (functionObject) {
      objects.push(buildObject({ ...functionObject, sourceFile, line: lineNumber }));
      continue;
    }

    const materializedView = matchNamedObject(line, /^CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+?)(?:\s+AS|\s*\()/i, 'materialized_view', searchPathSchema);
    if (materializedView) {
      objects.push(buildObject({ ...materializedView, sourceFile, line: lineNumber }));
      continue;
    }

    const view = matchNamedObject(line, /^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(.+?)(?:\s+AS|\s*\()/i, 'view', searchPathSchema);
    if (view) {
      objects.push(buildObject({ ...view, sourceFile, line: lineNumber }));
      continue;
    }

    const table = matchNamedObject(line, /^CREATE\s+(?:UNLOGGED\s+|TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+?)\s*\(/i, 'table', searchPathSchema);
    if (table) {
      objects.push(buildObject({ ...table, sourceFile, line: lineNumber }));
      continue;
    }

    if (/^CREATE\s+TRIGGER\s+/i.test(line)) {
      const statement = readStatement(lines, index);
      const trigger = matchTrigger(statement.text, searchPathSchema);
      if (trigger) {
        objects.push(buildObject({ ...trigger, sourceFile, line: lineNumber }));
      }
      index = statement.endIndex;
      continue;
    }

    if (/^CREATE\s+POLICY\s+/i.test(line)) {
      const statement = readStatement(lines, index);
      const policy = matchPolicy(statement.text, searchPathSchema);
      if (policy) {
        objects.push(buildObject({ ...policy, sourceFile, line: lineNumber }));
      }
      index = statement.endIndex;
      continue;
    }

    if (/^SELECT\s+auth\.create_(?:rls_policy|tenant_enforcement_trigger)\s*\(/i.test(line)) {
      const statement = readStatement(lines, index);
      const helperObject = matchAuthHelperObject(statement.text);
      if (helperObject) {
        objects.push(buildObject({ ...helperObject, sourceFile, line: lineNumber }));
      }
      index = statement.endIndex;
    }
  }

  return objects;
}

export function formatCsv(objects) {
  const header = ['schema', 'name', 'type', 'source_file', 'line', 'target'];
  const rows = objects.map((object) => [
    object.schema,
    object.name,
    object.type,
    object.source_file,
    String(object.line),
    object.target ?? '',
  ]);
  return `${[header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

function parseArgs(values) {
  const parsed = { ddlDir: defaultDdlDir };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--print-csv' || value === '--csv') {
      continue;
    }
    if (value === '--ddl-dir') {
      parsed.ddlDir = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith('--ddl-dir=')) {
      parsed.ddlDir = value.slice('--ddl-dir='.length);
    } else if (value === '--help' || value === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }
  return parsed;
}

function printUsage(stream = process.stdout) {
  stream.write(`Usage: node scripts/list-ddl-objects.mjs --print-csv [--ddl-dir <path>]

Scans db/ddl/*.sql and emits deterministic DDL object inventory rows.

Columns:
  schema, name, type, source_file, line, target
`);
}

function matchExtension(line) {
  const match = line.match(/^CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(.+?)(?:\s+WITH\b|;|$)/i);
  if (!match) return null;
  return { name: normalizeIdentifier(match[1]) };
}

function matchNamedObject(line, pattern, type, searchPathSchema) {
  const match = line.match(pattern);
  if (!match) return null;
  const qualifiedName = parseQualifiedName(match[1], searchPathSchema);
  return {
    schema: qualifiedName.schema,
    name: qualifiedName.name,
    type,
    target: '',
  };
}

function matchTrigger(statement, searchPathSchema) {
  const nameMatch = statement.match(/\bCREATE\s+TRIGGER\s+("([^"]|"")*"|[A-Za-z_][\w$]*)\b/i);
  const targetMatch = statement.match(/\bON\s+((?:"([^"]|"")*"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"([^"]|"")*"|[A-Za-z_][\w$]*))?)/i);
  if (!nameMatch) return null;
  const target = targetMatch ? parseQualifiedName(targetMatch[1], searchPathSchema) : { schema: searchPathSchema, name: '' };
  return {
    schema: target.schema,
    name: normalizeIdentifier(nameMatch[1]),
    type: 'trigger',
    target: target.name ? `${target.schema}.${target.name}` : '',
  };
}

function matchPolicy(statement, searchPathSchema) {
  const match = statement.match(/\bCREATE\s+POLICY\s+("([^"]|"")*"|[A-Za-z_][\w$]*)\s+ON\s+((?:"([^"]|"")*"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"([^"]|"")*"|[A-Za-z_][\w$]*))?)/i);
  if (!match) return null;
  const target = parseQualifiedName(match[3], searchPathSchema);
  return {
    schema: target.schema,
    name: normalizeIdentifier(match[1]),
    type: 'policy',
    target: `${target.schema}.${target.name}`,
  };
}

function matchAuthHelperObject(statement) {
  const args = parseSqlCallArgs(statement);
  if (/auth\.create_tenant_enforcement_trigger\s*\(/i.test(statement)) {
    const [schema, table, triggerName = 'enforce_tenant_context'] = args;
    if (!schema || !table) return null;
    return {
      schema,
      name: triggerName,
      type: 'trigger',
      target: `${schema}.${table}`,
    };
  }

  if (/auth\.create_rls_policy\s*\(/i.test(statement)) {
    const [schema, table, , , policyName = 'tenant_isolation'] = args;
    if (!schema || !table) return null;
    return {
      schema,
      name: policyName,
      type: 'policy',
      target: `${schema}.${table}`,
    };
  }

  return null;
}

function parseSqlCallArgs(statement) {
  const openIndex = statement.indexOf('(');
  const closeIndex = statement.lastIndexOf(')');
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) return [];
  return splitSqlArgs(statement.slice(openIndex + 1, closeIndex)).map(parseSqlArg);
}

function splitSqlArgs(value) {
  const args = [];
  let current = '';
  let quoted = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "'") {
      current += char;
      if (quoted && value[index + 1] === "'") {
        current += value[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (!quoted && depth === 0 && char === ',') {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function parseSqlArg(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (/^NULL$/i.test(trimmed)) return null;
  if (/^(?:TRUE|FALSE)$/i.test(trimmed)) return trimmed.toUpperCase() === 'TRUE';
  return trimmed;
}

function parseQualifiedName(value, fallbackSchema) {
  const parts = splitIdentifierParts(value).map(normalizeIdentifier).filter(Boolean);
  if (parts.length === 1) {
    return { schema: fallbackSchema, name: parts[0] };
  }
  return { schema: parts.at(-2), name: parts.at(-1) };
}

function splitIdentifierParts(value) {
  const parts = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"') {
      current += char;
      if (quoted && value[index + 1] === '"') {
        current += value[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === '.' && !quoted) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function normalizeIdentifier(value) {
  const trimmed = value.trim().replace(/;$/, '');
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return trimmed.toLowerCase();
}

function firstSearchPathSchema(value) {
  const [first] = value.split(',');
  if (!first) return null;
  const schema = normalizeIdentifier(first);
  if (!schema || schema === '$user') return null;
  return schema;
}

function readStatement(lines, startIndex) {
  const statementLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripSqlLineComment(lines[index]);
    statementLines.push(line);
    if (line.includes(';')) {
      return { text: statementLines.join('\n'), endIndex: index };
    }
  }
  return { text: statementLines.join('\n'), endIndex: lines.length - 1 };
}

function stripSqlLineComment(line) {
  let quoted = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    if (char === "'") {
      quoted = !quoted;
      if (quoted && line[index + 1] === "'") index += 1;
      continue;
    }
    if (!quoted && char === '-' && line[index + 1] === '-') {
      return line.slice(0, index);
    }
  }
  return line;
}

function buildObject({ schema, name, type, sourceFile, line, target = '' }) {
  return {
    schema,
    name,
    type,
    source_file: sourceFile,
    line,
    target,
  };
}

function compareDdlObjects(left, right) {
  return (
    left.source_file.localeCompare(right.source_file) ||
    left.line - right.line ||
    left.type.localeCompare(right.type) ||
    left.schema.localeCompare(right.schema) ||
    left.name.localeCompare(right.name)
  );
}

function csvEscape(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function requireValue(values, index, flag) {
  const value = values[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
