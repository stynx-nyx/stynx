import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { validateSqlWithParser } from './parser.js';
import {
  collectLeadingComments,
  extractParenthesized,
  lineNumberAt,
  normalizeIdentifier,
  splitStatements,
  splitTopLevel,
  toArchiveName,
  toQualifiedName,
} from './sql.js';
import type {
  ForeignKeyDescriptor,
  LintIssue,
  LintOptions,
  LintRunResult,
  QualifiedTableName,
  Statement,
  TableDescriptor,
} from './types.js';

interface ExplicitAlter {
  liveTable: string;
  archiveTable?: string;
  line: number;
  statementLine: number;
}

interface FileContext {
  filePath: string;
  relativeFile: string;
  sql: string;
  statements: Statement[];
}

function walkSqlFiles(targetPath: string): string[] {
  const stat = statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }

  const entries: string[] = [];
  for (const entry of readdirSync(targetPath)) {
    const fullPath = resolve(targetPath, entry);
    const entryStat = statSync(fullPath);
    if (entryStat.isDirectory()) {
      entries.push(...walkSqlFiles(fullPath));
      continue;
    }
    if (entry.toLowerCase().endsWith('.sql')) {
      entries.push(fullPath);
    }
  }
  return entries.sort((left, right) => left.localeCompare(right));
}

function findStatementTableName(statement: string): QualifiedTableName | null {
  const match = statement.match(
    /(?:CREATE|ALTER)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)\s*\.\s*("?[\w$]+"?)/i,
  );
  if (!match) {
    return null;
  }
  const schema = match[1];
  const table = match[2];
  if (!schema || !table) {
    return null;
  }
  return {
    schema: normalizeIdentifier(schema),
    table: normalizeIdentifier(table),
  };
}

function helperCreateTable(statement: Statement): TableDescriptor | null {
  const match = statement.text.match(
    /data\.create_soft_deletable_table\s*\(\s*(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*\)/i,
  );
  if (!match) {
    return null;
  }
  const ddl = match[2];
  if (!ddl) {
    return null;
  }
  const tableName = findStatementTableName(ddl);
  if (!tableName) {
    return null;
  }
  const body = extractParenthesized(ddl, ddl.search(/CREATE\s+TABLE/i));
  const qualifiedName = toQualifiedName(tableName.schema, tableName.table);
  const descriptor: TableDescriptor = {
    ...tableName,
    qualifiedName,
    archiveName: toArchiveName(tableName.schema, tableName.table),
    line: statement.line,
    statementLine: statement.line,
    source: 'helper',
    hasTenantId: true,
    noSoftDelete: false,
  };
  if (body) {
    descriptor.body = body;
  }
  return descriptor;
}

function explicitCreateTable(statement: Statement): TableDescriptor | null {
  if (!/CREATE\s+TABLE/i.test(statement.text)) {
    return null;
  }
  const tableName = findStatementTableName(statement.text);
  if (!tableName) {
    return null;
  }
  const body = extractParenthesized(statement.text, statement.text.search(/CREATE\s+TABLE/i));
  if (!body) {
    return null;
  }
  const qualifiedName = toQualifiedName(tableName.schema, tableName.table);
  const hasTenantId = /(^|[,\s(])tenant_id\b/i.test(body);
  return {
    ...tableName,
    body,
    qualifiedName,
    archiveName: toArchiveName(tableName.schema, tableName.table),
    line: statement.line,
    statementLine: statement.line,
    source: 'explicit',
    hasTenantId,
    noSoftDelete: /@no_soft_delete\s*:/i.test(statement.text),
  };
}

function explicitArchiveTable(statement: Statement): string | null {
  const tableName = findStatementTableName(statement.text);
  if (!tableName) {
    return null;
  }
  if (tableName.schema !== 'archive') {
    return null;
  }
  return tableName.table;
}

function helperAlterTable(statement: Statement): string | null {
  const match = statement.text.match(
    /data\.alter_soft_deletable_table\s*\(\s*'("?[\w$]+"?)\s*\.\s*("?[\w$]+"?)'/i,
  );
  if (!match) {
    return null;
  }
  const schema = match[1];
  const table = match[2];
  if (!schema || !table) {
    return null;
  }
  return toQualifiedName(schema, table);
}

function explicitAlterTable(statement: Statement): ExplicitAlter | null {
  if (!/ALTER\s+TABLE/i.test(statement.text)) {
    return null;
  }
  if (!/\b(ADD\s+COLUMN|DROP\s+COLUMN|ALTER\s+COLUMN|RENAME\s+COLUMN)\b/i.test(statement.text)) {
    return null;
  }
  const tableName = findStatementTableName(statement.text);
  if (!tableName) {
    return null;
  }
  const qualifiedName = toQualifiedName(tableName.schema, tableName.table);
  if (tableName.schema === 'archive') {
    const archiveMatch = tableName.table.match(/^([a-z0-9_]+)_([a-z0-9_]+)$/);
    const archiveSchema = archiveMatch?.[1];
    const archiveTable = archiveMatch?.[2];
    return {
      liveTable: archiveSchema && archiveTable ? toQualifiedName(archiveSchema, archiveTable) : qualifiedName,
      archiveTable: qualifiedName,
      line: statement.line,
      statementLine: statement.line,
    };
  }
  return {
    liveTable: qualifiedName,
    line: statement.line,
    statementLine: statement.line,
  };
}

function hasTenantIsolationPolicy(fileSql: string, table: TableDescriptor): boolean {
  const escapedQualifiedName = `${table.schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${table.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  const patterns = [
    new RegExp(
      `CREATE\\s+POLICY\\s+[\\w"]+\\s+ON\\s+${escapedQualifiedName}[\\s\\S]*?current_setting\\s*\\(\\s*'app\\.tenant_id'`,
      'i',
    ),
    new RegExp(
      `CREATE\\s+POLICY\\s+tenant_isolation\\s+ON\\s+${escapedQualifiedName}`,
      'i',
    ),
  ];
  return patterns.some((pattern) => pattern.test(fileSql));
}

function hasRlsEnable(fileSql: string, table: TableDescriptor): boolean {
  const escapedQualifiedName = `${table.schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${table.table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  return new RegExp(`ALTER\\s+TABLE\\s+${escapedQualifiedName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i').test(
    fileSql,
  );
}

function extractTopLevelItems(body: string): string[] {
  const rawItems = splitTopLevel(body, ',');
  const items: string[] = [];

  for (const rawItem of rawItems) {
    const { comments, rest } = collectLeadingComments(rawItem);
    if (comments.trim().length > 0 && items.length > 0) {
      const previousItem = items[items.length - 1];
      if (previousItem) {
        items[items.length - 1] = previousItem + comments;
      }
    }
    if (rest.trim().length > 0) {
      items.push(rest);
    }
  }

  return items;
}

function extractForeignKeys(table: TableDescriptor): ForeignKeyDescriptor[] {
  if (!table.body) {
    return [];
  }

  const items = extractTopLevelItems(table.body);
  const columnNullability = new Map<string, boolean>();

  for (const item of items) {
    const normalized = item.trim();
    if (
      normalized.length === 0 ||
      /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(normalized)
    ) {
      continue;
    }
    const columnMatch = normalized.match(/^("?[\w$]+"?)/);
    const columnName = columnMatch?.[1];
    if (!columnName) {
      continue;
    }
    columnNullability.set(normalizeIdentifier(columnName), !/\bNOT\s+NULL\b/i.test(normalized));
  }

  const descriptors: ForeignKeyDescriptor[] = [];

  for (const item of items) {
    if (!/\bREFERENCES\b/i.test(item)) {
      continue;
    }
    const parentMatch = item.match(/REFERENCES\s+("?[\w$]+"?)\s*\.\s*("?[\w$]+"?)/i);
    if (!parentMatch) {
      continue;
    }
    const parentSchema = parentMatch[1];
    const parentTable = parentMatch[2];
    if (!parentSchema || !parentTable) {
      continue;
    }

    const annotationMatch = item.match(/@softdelete_fk:\s*(hide|cascade|block)/i);
    const line = table.line + lineNumberAt(table.body, table.body.indexOf(item));
    let childColumn: string | undefined;
    let nullable: boolean | undefined;

    const inlineColumnMatch = item.trim().match(/^("?[\w$]+"?)/);
    const inlineColumn = inlineColumnMatch?.[1];
    if (inlineColumn && !/^(CONSTRAINT|FOREIGN)\b/i.test(inlineColumn)) {
      childColumn = normalizeIdentifier(inlineColumn);
      nullable = columnNullability.get(childColumn);
    } else {
      const foreignKeyMatch = item.match(/FOREIGN\s+KEY\s*\(\s*("?[\w$]+"?)\s*\)/i);
      const foreignKeyColumn = foreignKeyMatch?.[1];
      if (foreignKeyColumn) {
        childColumn = normalizeIdentifier(foreignKeyColumn);
        nullable = columnNullability.get(childColumn);
      }
    }

    const descriptor: ForeignKeyDescriptor = {
      itemText: item,
      line,
      parentSchema: normalizeIdentifier(parentSchema),
      parentTable: normalizeIdentifier(parentTable),
    };
    if (childColumn) {
      descriptor.childColumn = childColumn;
    }
    if (nullable !== undefined) {
      descriptor.nullable = nullable;
    }
    const annotation = annotationMatch?.[1]?.toLowerCase() as ForeignKeyDescriptor['annotation'] | undefined;
    if (annotation) {
      descriptor.annotation = annotation;
    }
    descriptors.push(descriptor);
  }

  return descriptors;
}

function destructiveApproved(statement: string): boolean {
  return /@destructive:\s*approved-by=/i.test(statement);
}

function securityDefinerApproved(statement: string): boolean {
  return /@security-definer-approved:\s*[^/\s]+\/\S+/i.test(statement);
}

function grantViolatesAuditRule(statement: string): boolean {
  if (!/GRANT/i.test(statement) || !/TO\s+stynx_app\b/i.test(statement) || !/ON\s+TABLE?\s+audit\./i.test(statement)) {
    return false;
  }

  const privilegesMatch = statement.match(/GRANT\s+([\s\S]*?)\s+ON\s+TABLE?\s+audit\./i);
  if (!privilegesMatch) {
    return false;
  }

  const privileges = privilegesMatch[1];
  if (!privileges) {
    return false;
  }
  const normalized = privileges.replace(/\s+/g, ' ').trim().toUpperCase();
  return normalized !== 'SELECT';
}

function createIssue(
  issues: LintIssue[],
  file: string,
  code: LintIssue['code'],
  message: string,
  line: number,
  statementLine: number,
  table?: string,
  suggestion?: string,
): void {
  issues.push({
    code,
    file,
    message,
    line,
    statementLine,
    ...(table ? { table } : {}),
    ...(suggestion ? { suggestion } : {}),
  });
}

function defaultLint001Suggestion(table: TableDescriptor): string {
  return [
    `ALTER TABLE ${table.qualifiedName} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${table.qualifiedName} FORCE ROW LEVEL SECURITY;`,
    `CREATE POLICY tenant_isolation ON ${table.qualifiedName}`,
    `  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`,
    `  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);`,
  ].join('\n');
}

function defaultLint002Suggestion(statement: Statement): string {
  const original = statement.text.trim().replace(/;$/, '');
  return [`SELECT data.create_soft_deletable_table($$`, original + ';', `$$);`].join('\n');
}

function buildFileContext(targetRoot: string, filePath: string): FileContext {
  const sql = readFileSync(filePath, 'utf8');
  return {
    filePath,
    relativeFile: relative(targetRoot, filePath) || filePath,
    sql,
    statements: splitStatements(sql),
  };
}

export async function lintSqlTarget(target: string, options: LintOptions = {}): Promise<LintRunResult> {
  const absoluteTarget = resolve(target);
  const rootForRelativePaths = statSync(absoluteTarget).isDirectory()
    ? absoluteTarget
    : resolve(absoluteTarget, '..');
  const files = walkSqlFiles(absoluteTarget);
  const result: LintRunResult = {
    files: files.map((file) => relative(process.cwd(), file) || file),
    issues: [],
    parserIssues: [],
  };

  const knownSoftTables = new Set<string>();
  const archiveNameOwners = new Map<string, string>();

  for (const filePath of files) {
    const file = buildFileContext(rootForRelativePaths, filePath);
    try {
      await validateSqlWithParser(file.sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.parserIssues.push({
        file: file.relativeFile,
        message,
      });
      continue;
    }

    const helperCreates: TableDescriptor[] = [];
    const explicitCreates: Array<{ table: TableDescriptor; statement: Statement }> = [];
    const explicitArchiveNames = new Set<string>();
    const helperAlteredTables = new Set<string>();
    const explicitLiveAlters: ExplicitAlter[] = [];
    const explicitArchiveAlters = new Set<string>();

    for (const statement of file.statements) {
      const helperCreate = helperCreateTable(statement);
      if (helperCreate) {
        helperCreates.push(helperCreate);
        continue;
      }

      const create = explicitCreateTable(statement);
      if (create) {
        explicitCreates.push({ table: create, statement });
        const archiveName = explicitArchiveTable(statement);
        if (archiveName) {
          explicitArchiveNames.add(archiveName);
        }
        continue;
      }

      const helperAlter = helperAlterTable(statement);
      if (helperAlter) {
        helperAlteredTables.add(helperAlter);
      }

      const explicitAlter = explicitAlterTable(statement);
      if (explicitAlter) {
        if (explicitAlter.archiveTable) {
          explicitArchiveAlters.add(explicitAlter.liveTable);
        } else {
          explicitLiveAlters.push(explicitAlter);
        }
      }

      if (/\b(DROP\s+TABLE|TRUNCATE\b|ALTER\s+TABLE[\s\S]*DROP\s+COLUMN)\b/i.test(statement.text) && !destructiveApproved(statement.text)) {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT005',
          'Destructive migration statement requires -- @destructive: approved-by=<ticket>.',
          statement.line,
          statement.line,
        );
      }

      if (/\bSECURITY\s+DEFINER\b/i.test(statement.text) && !securityDefinerApproved(statement.text)) {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT006',
          'SECURITY DEFINER requires -- @security-definer-approved: <name>/<ticket>.',
          statement.line,
          statement.line,
        );
      }

      if (grantViolatesAuditRule(statement.text)) {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT007',
          'audit.* tables are SELECT-only to stynx_app.',
          statement.line,
          statement.line,
        );
      }
    }

    const softTablesThisFile = new Map<string, TableDescriptor>();
    for (const table of helperCreates) {
      softTablesThisFile.set(table.qualifiedName, table);
    }
    for (const { table } of explicitCreates) {
      if (table.schema === 'archive') {
        continue;
      }
      if (table.hasTenantId && !table.noSoftDelete) {
        softTablesThisFile.set(table.qualifiedName, table);
      }
    }

    for (const table of softTablesThisFile.values()) {
      const existingOwner = archiveNameOwners.get(table.archiveName);
      if (existingOwner && existingOwner !== table.qualifiedName) {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT008',
          `Archive naming collision: ${table.qualifiedName} and ${existingOwner} both map to archive.${table.archiveName}.`,
          table.line,
          table.statementLine,
          table.qualifiedName,
        );
      } else {
        archiveNameOwners.set(table.archiveName, table.qualifiedName);
      }
    }

    for (const { table, statement } of explicitCreates) {
      if (table.schema === 'archive') {
        continue;
      }

      if (table.hasTenantId && !hasRlsEnable(file.sql, table) && table.source !== 'helper') {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT001',
          `Tenant-scoped table ${table.qualifiedName} must enable RLS and declare a tenant isolation policy in the same migration.`,
          table.line,
          table.statementLine,
          table.qualifiedName,
          options.includeFixSuggestions ? defaultLint001Suggestion(table) : undefined,
        );
      } else if (table.hasTenantId && !hasTenantIsolationPolicy(file.sql, table) && table.source !== 'helper') {
        createIssue(
          result.issues,
          file.relativeFile,
          'LINT001',
          `Tenant-scoped table ${table.qualifiedName} must enable RLS and declare a tenant isolation policy in the same migration.`,
          table.line,
          table.statementLine,
          table.qualifiedName,
          options.includeFixSuggestions ? defaultLint001Suggestion(table) : undefined,
        );
      }

      if (table.hasTenantId && !table.noSoftDelete) {
        const mirrorExists = explicitArchiveNames.has(table.archiveName);
        if (!mirrorExists) {
          createIssue(
            result.issues,
            file.relativeFile,
            'LINT002',
            `Soft-deletable table ${table.qualifiedName} must declare archive.${table.archiveName} in the same migration or use data.create_soft_deletable_table().`,
            table.line,
            table.statementLine,
            table.qualifiedName,
            options.includeFixSuggestions ? defaultLint002Suggestion(statement) : undefined,
          );
        }
      }
    }

    const knownSoftInScope = new Set<string>(knownSoftTables);
    for (const table of softTablesThisFile.keys()) {
      knownSoftInScope.add(table);
    }

    for (const table of softTablesThisFile.values()) {
      const foreignKeys = extractForeignKeys(table);
      for (const foreignKey of foreignKeys) {
        const parentQualifiedName = toQualifiedName(foreignKey.parentSchema, foreignKey.parentTable);
        if (!knownSoftInScope.has(parentQualifiedName)) {
          continue;
        }
        if (!foreignKey.annotation) {
          createIssue(
            result.issues,
            file.relativeFile,
            'LINT004',
            `FK to soft-deletable parent ${parentQualifiedName} requires -- @softdelete_fk: hide | cascade | block.`,
            foreignKey.line,
            table.statementLine,
            table.qualifiedName,
          );
          continue;
        }
        if (foreignKey.annotation === 'hide' && foreignKey.nullable === false) {
          createIssue(
            result.issues,
            file.relativeFile,
            'LINT009',
            `FK ${foreignKey.childColumn ?? '(unknown)'} on ${table.qualifiedName} cannot use hide while NOT NULL.`,
            foreignKey.line,
            table.statementLine,
            table.qualifiedName,
          );
        }
      }
    }

    for (const liveAlter of explicitLiveAlters) {
      if (!knownSoftInScope.has(liveAlter.liveTable)) {
        continue;
      }
      if (helperAlteredTables.has(liveAlter.liveTable) || explicitArchiveAlters.has(liveAlter.liveTable)) {
        continue;
      }
      createIssue(
        result.issues,
        file.relativeFile,
        'LINT003',
        `ALTER TABLE on soft-deletable table ${liveAlter.liveTable} must use data.alter_soft_deletable_table() or include the paired archive ALTER in the same migration.`,
        liveAlter.line,
        liveAlter.statementLine,
        liveAlter.liveTable,
      );
    }

    for (const table of softTablesThisFile.keys()) {
      knownSoftTables.add(table);
    }
  }

  result.issues.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.code.localeCompare(right.code);
  });

  return result;
}
