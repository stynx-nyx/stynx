import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { lineNumberAt, splitTopLevel } from './sql.js';
import type { LintIssue, Statement } from './types.js';

/** Thrown when a declared lint input (base dir, manifest) is missing or malformed; the CLI exits 2. */
export class LintInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LintInputError';
  }
}

export interface PopulationFile {
  /** Absolute path. */
  filePath: string;
  /** Path relative to the root it was found under, as used in `LintIssue.file`. */
  relativeFile: string;
  /** Path relative to the working directory, as listed in `LintRunResult.files`. */
  displayFile: string;
}

type IssueSink = (issue: LintIssue) => void;

const MIGRATION_PREFIX = /^(\d+)_/;

/** LINT010: a numeric migration prefix (`0012_`) names exactly one file across every linted root. */
export function checkGlobalPrefixes(population: PopulationFile[], report: IssueSink): void {
  const owners = new Map<string, PopulationFile>();
  for (const file of population) {
    const prefix = MIGRATION_PREFIX.exec(basename(file.filePath))?.[1];
    if (!prefix) {
      continue;
    }
    const owner = owners.get(prefix);
    if (!owner) {
      owners.set(prefix, file);
      continue;
    }
    report({
      code: 'LINT010',
      file: file.relativeFile,
      message: `Migration prefix ${prefix}_ is already used by ${owner.displayFile}; prefixes must be unique across every migration root.`,
      line: 1,
      statementLine: 1,
      suggestion: `Rename ${basename(file.filePath)} to the next unused prefix.`,
    });
  }
}

const POLICY_START = /\b(?:CREATE|ALTER)\s+POLICY\b/gi;
const SETTING_READ = /current_setting\s*\(\s*(?:E)?'{1,2}([^']+)'{1,2}/gi;

/** LINT011: row-level-security policies read only `app.*` GUCs. */
export function checkPolicyGucs(
  fileSql: string,
  relativeFile: string,
  statement: Statement,
  report: IssueSink,
): void {
  const statementOffset = Math.max(0, fileSql.indexOf(statement.text, statement.start));
  for (const policy of statement.text.matchAll(POLICY_START)) {
    const policyStart = policy.index;
    const terminator = statement.text.indexOf(';', policyStart);
    const policyText = statement.text.slice(policyStart, terminator < 0 ? undefined : terminator);
    for (const setting of policyText.matchAll(SETTING_READ)) {
      const guc = setting[1] ?? '';
      if (guc.toLowerCase().startsWith('app.')) {
        continue;
      }
      const line = lineNumberAt(fileSql, statementOffset + policyStart + setting.index);
      report({
        code: 'LINT011',
        file: relativeFile,
        message: `Policy reads GUC '${guc}'; row-level-security policies may read only app.* settings.`,
        line,
        statementLine: lineNumberAt(fileSql, statementOffset),
        suggestion: `Replace current_setting('${guc}', ...) with the matching app.* setting.`,
      });
    }
  }
}

/** Column-name tokens that mark a column as personal data under LGPD (LINT012). */
export const PII_COLUMN_TOKENS = [
  'email',
  'cpf',
  'rg',
  'ssn',
  'passport',
  'phone',
  'telefone',
  'celular',
  'mobile',
  'birthdate',
  'birthday',
  'nascimento',
  'address',
  'endereco',
  'cep',
  'zipcode',
] as const;

/** Whole column names that mark personal data but are not captured by a single token. */
export const PII_COLUMN_NAMES = [
  'birth_date',
  'date_of_birth',
  'full_name',
  'first_name',
  'last_name',
  'nome',
  'nome_completo',
  'postal_code',
  'national_id',
  'tax_id',
  'document_number',
] as const;

const PII_ANNOTATION = /--\s*@pii:\s*([^\n]*)/i;

export function isPiiColumnName(column: string): boolean {
  const name = column.toLowerCase();
  if ((PII_COLUMN_NAMES as readonly string[]).includes(name)) {
    return true;
  }
  return name.split('_').some((token) => (PII_COLUMN_TOKENS as readonly string[]).includes(token));
}

function annotationProblem(annotation: string | undefined): string | null {
  if (annotation === undefined) {
    return 'has no -- @pii: annotation';
  }
  const missing = ['basis', 'retention'].filter(
    (key) => !new RegExp(`\\b${key}\\s*=\\s*[^,\\s]+`, 'i').test(annotation),
  );
  return missing.length === 0 ? null : `@pii annotation lacks ${missing.join(' and ')}=`;
}

interface ColumnDefinition {
  name: string;
  offset: number;
  annotation?: string;
}

function leadingCommentLength(text: string): number {
  return /^(\s*(?:--[^\n]*\n?)*)/.exec(text)?.[0].length ?? 0;
}

/**
 * Splits a CREATE TABLE body into column definitions, attaching a `-- @pii:` comment found on the
 * column's own line (after the comma or at the end of the definition) or on the lines directly
 * above it.
 */
function columnDefinitions(body: string, bodyOffset: number): ColumnDefinition[] {
  const rawItems = splitTopLevel(body, ',');
  const columns: ColumnDefinition[] = [];
  let cursor = 0;
  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index] ?? '';
    const rawStart = body.indexOf(raw, cursor);
    cursor = rawStart + raw.length;
    const commentLength = leadingCommentLength(raw);
    const leading = raw.slice(0, commentLength);
    const definition = raw.slice(commentLength);
    const nameMatch = /^("?[\w$]+"?)/.exec(definition.trim());
    const name = nameMatch?.[1]?.replace(/"/g, '');
    if (!name || /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)$/i.test(name)) {
      continue;
    }
    const firstNewline = leading.indexOf('\n');
    const header = firstNewline < 0 ? '' : leading.slice(firstNewline);
    const next = rawItems[index + 1] ?? '';
    const nextNewline = next.indexOf('\n');
    const trailing = nextNewline < 0 ? next : next.slice(0, nextNewline);
    const annotation =
      PII_ANNOTATION.exec(definition)?.[1] ??
      PII_ANNOTATION.exec(trailing)?.[1] ??
      PII_ANNOTATION.exec(header)?.[1];
    columns.push({
      name,
      offset:
        bodyOffset + rawStart + commentLength + (definition.length - definition.trimStart().length),
      ...(annotation !== undefined ? { annotation } : {}),
    });
  }
  return columns;
}

function tableBody(text: string): { body: string; offset: number } | null {
  const create = /CREATE\s+TABLE[^(]*\(/i.exec(text);
  if (!create) {
    return null;
  }
  const open = create.index + create[0].length - 1;
  let depth = 0;
  let quote: string | null = null;
  let lineComment = false;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (lineComment) {
      lineComment = char !== '\n';
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '-' && text[cursor + 1] === '-') {
      lineComment = true;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return { body: text.slice(open + 1, cursor), offset: open + 1 };
      }
    }
  }
  return null;
}

/** LINT012 (under `--lgpd`): every PII column carries `-- @pii: basis=<basis>, retention=<retention>`. */
export function checkPiiAnnotations(
  fileSql: string,
  relativeFile: string,
  statement: Statement,
  report: IssueSink,
): void {
  const statementOffset = Math.max(0, fileSql.indexOf(statement.text, statement.start));
  const statementLine = lineNumberAt(fileSql, statementOffset);
  const columns: ColumnDefinition[] = [];

  const table = tableBody(statement.text);
  if (
    table &&
    !/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?archive"?\s*\./i.test(statement.text)
  ) {
    columns.push(...columnDefinitions(table.body, table.offset));
  }

  for (const added of statement.text.matchAll(
    /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)/gi,
  )) {
    // The column's own source line (a trailing comment may follow the terminating `;`) and the
    // line directly above it.
    const fileOffset = statementOffset + added.index;
    const end = fileSql.indexOf('\n', fileOffset);
    const lineText = fileSql.slice(fileOffset, end < 0 ? undefined : end);
    const lineStart = fileSql.lastIndexOf('\n', fileOffset - 1) + 1;
    const above = fileSql.slice(0, lineStart).split('\n').slice(-2).join('\n');
    const annotation = PII_ANNOTATION.exec(lineText)?.[1] ?? PII_ANNOTATION.exec(above)?.[1];
    columns.push({
      name: (added[1] ?? '').replace(/"/g, ''),
      offset: added.index,
      ...(annotation !== undefined ? { annotation } : {}),
    });
  }

  for (const column of columns) {
    if (!isPiiColumnName(column.name)) {
      continue;
    }
    const problem = annotationProblem(column.annotation);
    if (!problem) {
      continue;
    }
    report({
      code: 'LINT012',
      file: relativeFile,
      message: `PII column ${column.name} ${problem}; LGPD requires a documented legal basis and retention.`,
      line: lineNumberAt(fileSql, statementOffset + column.offset),
      statementLine,
      suggestion: `${column.name} ... -- @pii: basis=<legal basis>, retention=<period>`,
    });
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function cwdRelative(path: string): string {
  return relative(process.cwd(), path).split(sep).join('/');
}

function isInside(root: string, path: string): boolean {
  const offset = relative(root, path);
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}

export interface ManifestEntry {
  digest: string;
  path: string;
  line: number;
}

/** Reads a `sha256sum`-form manifest; any unreadable or malformed input is a LintInputError. */
export function readManifest(manifestPath: string): ManifestEntry[] {
  const absolute = resolve(manifestPath);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new LintInputError(`--manifest ${manifestPath} does not exist or is not a file.`);
  }
  const entries: ManifestEntry[] = [];
  const lines = readFileSync(absolute, 'utf8').split('\n');
  for (const [index, raw] of lines.entries()) {
    const text = raw.trim();
    if (text.length === 0 || text.startsWith('#')) {
      continue;
    }
    const match = /^([0-9a-f]{64}) [ *](.+)$/i.exec(text);
    if (!match?.[1] || !match[2]) {
      throw new LintInputError(
        `--manifest ${manifestPath}:${index + 1} is not '<sha256>  <path>' (sha256sum form).`,
      );
    }
    entries.push({ digest: match[1].toLowerCase(), path: match[2], line: index + 1 });
  }
  return entries;
}

export function assertBaseDir(baseDir: string): string {
  const absolute = resolve(baseDir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new LintInputError(`--base-dir ${baseDir} does not exist or is not a directory.`);
  }
  return absolute;
}

/**
 * LINT013: applied migrations are immutable. A manifest-listed file inside a linted root must
 * match its recorded SHA-256 (and must still exist); a file present in the base dir must be
 * byte-identical at head.
 */
export function checkAppliedBytes(
  roots: string[],
  population: PopulationFile[],
  manifest: ManifestEntry[] | null,
  baseDir: string | null,
  report: IssueSink,
): void {
  const byPath = new Map(population.map((file) => [file.filePath, file]));

  for (const entry of manifest ?? []) {
    const absolute = resolve(entry.path);
    if (!roots.some((root) => isInside(root, absolute))) {
      continue;
    }
    const file = byPath.get(absolute);
    if (!existsSync(absolute)) {
      report({
        code: 'LINT013',
        file: entry.path,
        message: `Applied migration ${entry.path} listed in the manifest is missing; applied migrations are never removed.`,
        line: 1,
        statementLine: 1,
      });
      continue;
    }
    const actual = sha256(readFileSync(absolute));
    if (actual !== entry.digest) {
      report({
        code: 'LINT013',
        file: file?.relativeFile ?? entry.path,
        message: `Applied migration ${entry.path} changed: sha256 ${actual} differs from manifest ${entry.digest}; add a new migration instead.`,
        line: 1,
        statementLine: 1,
      });
    }
  }

  if (!baseDir) {
    return;
  }
  for (const file of population) {
    const basePath = resolve(baseDir, cwdRelative(file.filePath));
    if (!existsSync(basePath)) {
      continue;
    }
    if (!readFileSync(basePath).equals(readFileSync(file.filePath))) {
      report({
        code: 'LINT013',
        file: file.relativeFile,
        message: `Migration ${file.displayFile} present at base differs at head; applied migrations are never rewritten.`,
        line: 1,
        statementLine: 1,
      });
    }
  }
}
