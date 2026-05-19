import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const proposedPermissionPlaceholder = 'TODO' + '_PERMISSION';

export interface RouteCandidate {
  file: string;
  method: string;
  handler: string;
}

export interface TableScanResult {
  table: string;
  file: string;
  tenantColumn?: 'tenant_id' | 'organization_id';
  hasDeletedColumn: boolean;
}

export interface AdoptScanReport {
  repository: string;
  nodeFiles: number;
  sqlFiles: number;
  migrations: number;
  invariants: {
    rawDbConnection: {
      callSites: string[];
      pgImports: string[];
    };
    routePermissions: RouteCandidate[];
    tenancy: {
      organizationIdTables: string[];
      missingRlsTables: string[];
    };
    audit: {
      missingAuditTables: string[];
    };
    softDelete: {
      missingArchiveTables: string[];
      adHocSoftDeleteTables: string[];
    };
  };
  authLayer: {
    customJwtMiddleware: string[];
  };
  other: {
    readOnlyCandidates: string[];
    appendOnlyCandidates: string[];
  };
}

export interface AdoptApplyResult {
  changedFiles: string[];
  generatedFiles: string[];
}

export interface LinkCognitoUsersResult {
  matched: Array<{ userId: string; email: string; cognitoSub: string }>;
  unmatched: Array<{ userId: string; email: string }>;
}

interface SqlTableDefinition {
  name: string;
  body: string;
  file: string;
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', '.turbo'].includes(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function rel(targetDir: string, filePath: string): string {
  return relative(targetDir, filePath);
}

function parseSqlTables(targetDir: string): SqlTableDefinition[] {
  const tables: SqlTableDefinition[] = [];
  for (const filePath of walk(targetDir)) {
    if (!filePath.endsWith('.sql')) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const createTablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_."]+)\s*\(([\s\S]*?)\);/giu;
    let match: RegExpExecArray | null;
    while ((match = createTablePattern.exec(content)) !== null) {
      tables.push({
        name: match[1]!.replace(/"/gu, ''),
        body: match[2] ?? '',
        file: rel(targetDir, filePath),
      });
    }
  }
  return tables;
}

function scanTables(targetDir: string): TableScanResult[] {
  const unique = new Map<string, SqlTableDefinition>();
  for (const table of parseSqlTables(targetDir)) {
    if (!unique.has(table.name)) {
      unique.set(table.name, table);
    }
  }
  return [...unique.values()].map((table) => {
    const body = table.body.toLowerCase();
    const tenantColumn = body.includes('tenant_id')
      ? 'tenant_id'
      : body.includes('organization_id')
        ? 'organization_id'
        : undefined;
    return {
      table: table.name,
      file: table.file,
      ...(tenantColumn ? { tenantColumn } : {}),
      hasDeletedColumn: /\bdeleted\b/.test(body) || /\bdeleted_at\b/.test(body),
    };
  });
}

function hasRlsForTable(sqlContent: string, tableName: string): boolean {
  const unqualified = tableName.split('.').pop() ?? tableName;
  return new RegExp(`alter\\s+table\\s+${unqualified.replace('.', '\\.')}\\s+enable\\s+row\\s+level\\s+security`, 'iu').test(sqlContent);
}

function hasAuditForTable(sqlContent: string, tableName: string): boolean {
  const unqualified = tableName.split('.').pop() ?? tableName;
  return new RegExp(`audit\\.enable_for\\([^)]*${unqualified.replace('.', '\\.')}`, 'iu').test(sqlContent);
}

function hasSoftDeleteMirror(sqlContent: string, tableName: string): boolean {
  const unqualified = tableName.split('.').pop() ?? tableName;
  return new RegExp(`(create_soft_deletable_table|adopt_soft_deletable_table)[\\s\\S]*${unqualified.replace('.', '\\.')}`, 'iu').test(sqlContent)
    || new RegExp(`archive\\.${unqualified.replace('.', '_')}`, 'iu').test(sqlContent);
}

function collectSqlCorpus(targetDir: string): string {
  return walk(targetDir)
    .filter((filePath) => filePath.endsWith('.sql'))
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n');
}

function routeCandidates(targetDir: string): RouteCandidate[] {
  const candidates: RouteCandidate[] = [];
  for (const filePath of walk(targetDir)) {
    if (!/\.(ts|js)$/u.test(filePath)) {
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    const routePattern = /((?:@[A-Za-z():'"\s,*-]+\n)*)\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/gu;
    let match: RegExpExecArray | null;
    while ((match = routePattern.exec(content)) !== null) {
      const decorators = match[1] ?? '';
      if (!/@(?:Get|Post|Put|Patch|Delete)\(/u.test(decorators)) {
        continue;
      }
      if (/@(?:Permission|Public|System)\(/u.test(decorators)) {
        continue;
      }
      const methodDecorator = /@(Get|Post|Put|Patch|Delete)\(/u.exec(decorators)?.[1] ?? 'Unknown';
      candidates.push({
        file: rel(targetDir, filePath),
        method: methodDecorator.toUpperCase(),
        handler: match[2] ?? 'unknown',
      });
    }
  }
  return candidates;
}

function readOnlyCandidates(targetDir: string): string[] {
  const candidates: string[] = [];
  for (const route of routeCandidates(targetDir)) {
    if (route.method === 'GET' && /report|utilization|calendar|list/i.test(route.handler)) {
      candidates.push(`${route.file}:${route.handler}`);
    }
  }
  return candidates;
}

function appendOnlyCandidates(targetDir: string): string[] {
  return scanTables(targetDir)
    .filter((table) => /_log$/u.test(table.table))
    .map((table) => table.table);
}

export function adoptScan(targetDir: string): AdoptScanReport {
  const files = walk(targetDir);
  const nodeFiles = files.filter((filePath) => /\.(ts|js)$/u.test(filePath)).length;
  const sqlFiles = files.filter((filePath) => filePath.endsWith('.sql')).length;
  const migrations = files.filter((filePath) => /migrations\/.*\.sql$/u.test(filePath)).length;
  const sqlCorpus = collectSqlCorpus(targetDir);
  const tables = scanTables(targetDir);
  const directQueryCallSites: string[] = [];
  const pgImports: string[] = [];
  const customJwtMiddleware: string[] = [];

  for (const filePath of files) {
    if (!/\.(ts|js)$/u.test(filePath)) {
      continue;
    }
    const relativePath = rel(targetDir, filePath);
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (const [index, line] of lines.entries()) {
      if (/(?:pool|client)\.query\(/u.test(line)) {
        directQueryCallSites.push(`${relativePath}:${index + 1}`);
      }
      if (/\bfrom ['"]pg['"]|require\(['"]pg['"]\)/u.test(line)) {
        pgImports.push(`${relativePath}:${index + 1}`);
      }
    }
    if (/jwt/i.test(content) && /middleware/i.test(content)) {
      customJwtMiddleware.push(relativePath);
    }
  }

  const tenantTables = tables.filter((table) => table.tenantColumn !== undefined);
  const organizationIdTables = tenantTables
    .filter((table) => table.tenantColumn === 'organization_id')
    .map((table) => table.table);
  const missingRlsTables = tenantTables
    .filter((table) => !hasRlsForTable(sqlCorpus, table.table))
    .map((table) => table.table);
  const missingAuditTables = tenantTables
    .filter((table) => !hasAuditForTable(sqlCorpus, table.table))
    .map((table) => table.table);
  const missingArchiveTables = tenantTables
    .filter((table) => !hasSoftDeleteMirror(sqlCorpus, table.table) && !/_log$/u.test(table.table))
    .map((table) => table.table);
  const adHocSoftDeleteTables = tenantTables
    .filter((table) => table.hasDeletedColumn)
    .map((table) => table.table);

  return {
    repository: targetDir,
    nodeFiles,
    sqlFiles,
    migrations,
    invariants: {
      rawDbConnection: {
        callSites: directQueryCallSites,
        pgImports,
      },
      routePermissions: routeCandidates(targetDir),
      tenancy: {
        organizationIdTables,
        missingRlsTables,
      },
      audit: {
        missingAuditTables,
      },
      softDelete: {
        missingArchiveTables,
        adHocSoftDeleteTables,
      },
    },
    authLayer: {
      customJwtMiddleware,
    },
    other: {
      readOnlyCandidates: readOnlyCandidates(targetDir),
      appendOnlyCandidates: appendOnlyCandidates(targetDir),
    },
  };
}

export function formatAdoptScanHuman(report: AdoptScanReport): string {
  const lines = [
    'Compliance report',
    '=================',
    '',
    'INVARIANT VIOLATIONS',
    '',
    `  I1  No raw DB connection`,
    `      ${report.invariants.rawDbConnection.callSites.length > 0 ? `✗ ${report.invariants.rawDbConnection.callSites.length} direct query call sites` : '✓ none'}`,
    `      ${report.invariants.rawDbConnection.pgImports.length > 0 ? `✗ ${report.invariants.rawDbConnection.pgImports.length} pg import sites` : '✓ none'}`,
    '',
    '  I4  Every HTTP route has a permission',
    `      ${report.invariants.routePermissions.length > 0 ? `✗ ${report.invariants.routePermissions.length} routes without @Permission / @Public / @System` : '✓ none'}`,
    '',
    '  I5  Every tenant-scoped table has tenant_id + RLS',
    `      ${report.invariants.tenancy.organizationIdTables.length > 0 ? `✗ ${report.invariants.tenancy.organizationIdTables.length} tables use organization_id` : '✓ none'}`,
    `      ${report.invariants.tenancy.missingRlsTables.length > 0 ? `✗ ${report.invariants.tenancy.missingRlsTables.length} tables without RLS` : '✓ none'}`,
    '',
    '  I6  Every mutation is audited',
    `      ${report.invariants.audit.missingAuditTables.length > 0 ? `✗ ${report.invariants.audit.missingAuditTables.length} tables missing audit hooks` : '✓ none'}`,
    '',
    '  I8  Every tenant-scoped table is soft-deletable',
    `      ${report.invariants.softDelete.missingArchiveTables.length > 0 ? `✗ ${report.invariants.softDelete.missingArchiveTables.length} tables lack archive mirrors` : '✓ none'}`,
    `      ${report.invariants.softDelete.adHocSoftDeleteTables.length > 0 ? `✗ ${report.invariants.softDelete.adHocSoftDeleteTables.length} tables use ad-hoc deleted columns` : '✓ none'}`,
  ];
  return lines.join('\n');
}

function ensureImport(content: string, statement: string): string {
  return content.includes(statement) ? content : `${statement}\n${content}`;
}

function injectPermissionImports(content: string): string {
  if (content.includes("@stynx/auth")) {
    if (content.includes(proposedPermissionPlaceholder)) {
      return content;
    }
    return content.replace(
      /import\s+\{([^}]*)\}\s+from\s+['"]@stynx\/auth['"];/u,
      (_match, names: string) => `import { ${names.trim()}, ${proposedPermissionPlaceholder} } from '@stynx/auth';`,
    );
  }
  return ensureImport(content, `import { Permission, ${proposedPermissionPlaceholder} } from '@stynx/auth';`);
}

function codemodRoutePermissions(content: string): string {
  const lines = content.split('\n');
  const nextLines: string[] = [];
  for (const line of lines) {
    if (/^\s*@(Get|Post|Put|Patch|Delete)\(/u.test(line)) {
      const previousLine = nextLines[nextLines.length - 1] ?? '';
      if (!/@(?:Permission|Public|System)\(/u.test(previousLine)) {
        const indent = line.match(/^\s*/u)?.[0] ?? '';
        nextLines.push(`${indent}@Permission(${proposedPermissionPlaceholder})`);
      }
    }
    nextLines.push(line);
  }
  return nextLines.join('\n');
}

function codemodPoolUsage(content: string): string {
  let next = content;
  next = next.replace(/import\s+\{\s*Pool\s*(?:,\s*Client\s*)?\}\s+from\s+['"]pg['"];\n?/gu, "import { Database } from '@stynx/data';\n");
  next = next.replace(/import\s+pg\s+from\s+['"]pg['"];\n?/gu, "import { Database } from '@stynx/data';\n");
  next = next.replace(/constructor\(([^)]*?)private readonly (pool|client):\s*(Pool|Client)([^)]*?)\)/gu, "constructor($1private readonly db: Database$4)");
  next = next.replace(/\b(private readonly )?(pool|client)\s*=\s*new\s+(?:Pool|pg\.Pool|Client|pg\.Client)\([^;]*\);/gu, '/* TODO(stynx-adopt): inject Database via NestJS DI */');
  next = next.replace(/\bthis\.(pool|client)\.query\(([\s\S]*?)\);/gu, 'this.db.tx(async (trx) => trx.query($2));');
  return next;
}

function codemodAuthMiddleware(content: string): string {
  if (content.includes('DEPRECATED in favor of @stynx/auth.')) {
    return content;
  }
  if (!/middleware/iu.test(content) || !/jwt/iu.test(content)) {
    return content;
  }
  return [
    '// DEPRECATED in favor of @stynx/auth.',
    '// Left in-tree to ease rollback during adoption cutover.',
    content,
  ].join('\n');
}

function sqlTypeToDrizzle(columnName: string, sqlType: string, constraints: string): string {
  const lower = sqlType.toLowerCase();
  const quoted = `'${columnName}'`;
  let expression = lower.includes('uuid')
    ? `uuid(${quoted})`
    : lower.includes('timestamp')
      ? `timestamp(${quoted}, { withTimezone: true })`
      : lower.includes('boolean')
        ? `boolean(${quoted})`
        : `text(${quoted})`;
  if (/primary key/iu.test(constraints)) {
    expression += '.primaryKey()';
  }
  if (/not null/iu.test(constraints)) {
    expression += '.notNull()';
  }
  return expression;
}

function generateSchemaFile(targetDir: string, tables: TableScanResult[]): string {
  const imports = new Set<string>(['pgTable']);
  const bodies: string[] = [];
  for (const definition of parseSqlTables(targetDir)) {
    const bodyLines = definition.body
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0 && !/^constraint\b/iu.test(entry));
    const fieldLines: string[] = [];
    for (const line of bodyLines) {
      const match = /^([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+(?:\s+with(?:out)?\s+time\s+zone)?)([\s\S]*)$/u.exec(line);
      if (!match) {
        continue;
      }
      const [, columnName, sqlType, constraints] = match;
      const drizzle = sqlTypeToDrizzle(columnName!, sqlType!, constraints ?? '');
      if (drizzle.startsWith('uuid(')) imports.add('uuid');
      if (drizzle.startsWith('timestamp(')) imports.add('timestamp');
      if (drizzle.startsWith('boolean(')) imports.add('boolean');
      if (drizzle.startsWith('text(')) imports.add('text');
      fieldLines.push(`    ${columnName}: ${drizzle},`);
    }
    const name = definition.name.split('.').pop()!;
    const variable = name.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
    const marker = tables.find((table) => table.table === definition.name && !/_log$/u.test(table.table) && table.tenantColumn !== undefined)
      ? 'softDeletable(\n'
      : '';
    const markerClose = marker ? '\n)' : '';
    bodies.push(
      `export const ${variable} = ${marker}pgTable('${name}', {\n${fieldLines.join('\n')}\n  })${markerClose};`,
    );
  }
  const importList = [...imports].sort().join(', ');
  return [
    `import { ${importList} } from 'drizzle-orm/pg-core';`,
    "import { softDeletable } from '@stynx/data';",
    '',
    ...bodies,
    '',
  ].join('\n');
}

function generateAdoptionMigration(table: TableScanResult): string {
  const name = table.table.split('.').pop()!;
  const tenantRename = table.tenantColumn === 'organization_id'
    ? `ALTER TABLE ${name} RENAME COLUMN organization_id TO tenant_id;\n`
    : '';
  const helper = table.hasDeletedColumn
    ? `SELECT data.adopt_soft_deletable_table(\n  live_table => '${name}',\n  soft_delete_column => 'deleted',\n  deleted_at_column => 'deleted_at',\n  deleted_by_column => NULL\n);\n`
    : `-- Reviewer: wrap ${name} with data.create_soft_deletable_table(...) after validating archive semantics.\n`;
  return [
    `-- Generated by stynx adopt apply`,
    'BEGIN;',
    tenantRename.trimEnd(),
    helper.trimEnd(),
    `ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;`,
    `SELECT audit.enable_for('${name}');`,
    'COMMIT;',
    '',
  ].filter((line) => line.length > 0).join('\n');
}

export function adoptApply(targetDir: string, dryRun = false): AdoptApplyResult {
  const changedFiles: string[] = [];
  const generatedFiles: string[] = [];
  for (const filePath of walk(targetDir)) {
    if (!/\.(ts|js)$/u.test(filePath)) {
      continue;
    }
    const original = readFileSync(filePath, 'utf8');
    let next = codemodPoolUsage(original);
    next = codemodAuthMiddleware(next);
    if (/@(?:Post|Put|Patch|Delete|Get)\(/u.test(next)) {
      next = injectPermissionImports(next);
      next = codemodRoutePermissions(next);
    }
    if (next !== original) {
      changedFiles.push(rel(targetDir, filePath));
      if (!dryRun) {
        writeFileSync(filePath, next, 'utf8');
      }
    }
  }

  const tableScan = scanTables(targetDir);
  const targetTables = tableScan.filter((table) => table.tenantColumn !== undefined && !/_log$/u.test(table.table));
  const migrationDir = resolve(targetDir, 'generated/stynx-adopt/migrations');
  const schemaDir = resolve(targetDir, 'generated/stynx-adopt');
  const schemaFile = resolve(schemaDir, 'schema.ts');

  if (!dryRun) {
    mkdirSync(migrationDir, { recursive: true });
    mkdirSync(schemaDir, { recursive: true });
    writeFileSync(schemaFile, generateSchemaFile(targetDir, targetTables), 'utf8');
  }
  generatedFiles.push(rel(targetDir, schemaFile));

  let sequence = 1;
  for (const table of targetTables) {
    const filePath = resolve(migrationDir, `${String(sequence).padStart(4, '0')}_stynx_adopt_${table.table.split('.').pop()}.sql`);
    if (!dryRun) {
      writeFileSync(filePath, generateAdoptionMigration(table), 'utf8');
    }
    generatedFiles.push(rel(targetDir, filePath));
    sequence += 1;
  }

  return { changedFiles, generatedFiles };
}

export function adoptApplyProposedPermissions(targetDir: string, replacements: Record<string, string>): number {
  let count = 0;
  for (const filePath of walk(targetDir)) {
    if (!/\.(ts|js)$/u.test(filePath)) {
      continue;
    }
    const original = readFileSync(filePath, 'utf8');
    let next = original;
    for (const [placeholder, value] of Object.entries(replacements)) {
      next = next.replace(new RegExp(placeholder, 'gu'), value);
    }
    if (next !== original) {
      writeFileSync(filePath, next, 'utf8');
      count += 1;
    }
  }
  return count;
}

export function linkCognitoUsers(users: Array<{ id: string; email: string }>, cognitoUsers: Array<{ sub: string; email: string }>): LinkCognitoUsersResult {
  const byEmail = new Map(cognitoUsers.map((entry) => [entry.email.toLowerCase(), entry]));
  const matched: LinkCognitoUsersResult['matched'] = [];
  const unmatched: LinkCognitoUsersResult['unmatched'] = [];
  for (const user of users) {
    const match = byEmail.get(user.email.toLowerCase());
    if (match) {
      matched.push({ userId: user.id, email: user.email, cognitoSub: match.sub });
      continue;
    }
    unmatched.push({ userId: user.id, email: user.email });
  }
  return { matched, unmatched };
}
