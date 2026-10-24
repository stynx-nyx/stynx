import { createHash } from 'node:crypto';
import {
  collectStorageCatalog,
  executeTypedQuery,
  executeConfiguredQuery,
  quoteStorageIdentifier,
  resolveStorageRoleBinding,
} from '@stynx-nyx/data';
import type {
  StorageBindingOptions,
  StorageCatalogEntry,
  StorageRoleBinding,
  StorageVerificationCheck,
  StorageVerificationReport,
  StorageVerifierTransaction,
} from '@stynx-nyx/data';
import { OFFLINE_STORAGE_TEMPLATE } from './storage-template.generated.js';
import { OFFLINE_STORAGE_CATALOG } from './storage-catalog.generated.js';
import { storageAdmission, storageVisibility, storageRestrictedRoles, storageSchemaOwner, storageApplicableRoles, storagePrivileges, storageForeignKeyEnforcement } from './storage.repository.js';
import { inspectOfflineRows } from './storage-invariants.js';

export type OfflineStorageOptions = StorageBindingOptions;
export interface OfflineStorageManifest {
  contractVersion: string;
  packageVersion: string;
  sources: readonly { path: string; sha256: string }[];
  catalog: readonly StorageCatalogEntry[];
  dependencies: readonly string[];
  templateSha256: string;
}
export interface OfflineStorageArtifact {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  objectsSql: string;
  roleBindingsSql: string;
  manifest: OfflineStorageManifest;
}
export interface OfflineStorageMigration {
  source: { path: string; sha256: string };
  sql: string;
  sqlSha256: string;
}
export interface OfflineStorageMigrationsArtifact {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  migrations: readonly OfflineStorageMigration[];
}

const DEFAULT_ROLES = ['stynx_owner', 'stynx_app', 'stynx_reader'] as const;
function roleMap(binding: StorageRoleBinding): Record<string, string> {
  return {
    stynx_owner: binding.ownerRole,
    stynx_app: binding.appRole,
    stynx_reader: binding.readerRole ?? 'stynx_reader',
  };
}
function bindSql(sql: string, binding: StorageRoleBinding): string {
  const roles = roleMap(binding);
  return sql
    .replace(/\b(stynx_owner|stynx_app|stynx_reader)\b/gu, (identifier) =>
      quoteStorageIdentifier(roles[identifier]!),
    )
    .replace(
      /REFERENCES tenancy\.tenants\(id\)/gu,
      `REFERENCES ${quoteStorageIdentifier(binding.tenantTable.schema)}.${quoteStorageIdentifier(binding.tenantTable.table)}(${quoteStorageIdentifier(binding.tenantTable.column)})`,
    );
}
function policyName(name: string, roles: readonly string[], binding: StorageRoleBinding): string {
  const custom =
    roles.includes('stynx_app') && binding.appRole !== 'stynx_app'
      ? binding.appRole
      : roles.includes('stynx_reader') && binding.readerRole !== 'stynx_reader'
        ? binding.readerRole
        : null;
  return custom === null
    ? name
    : `${name}__${createHash('sha256').update(custom).digest('hex').slice(0, 12)}`;
}
function bindStatement(statement: string, binding: StorageRoleBinding): string | null {
  let sql = statement;
  if (binding.readerRole === null && sql.includes('stynx_reader')) {
    if (/ TO stynx_reader\b/u.test(sql) || / FROM stynx_reader;/u.test(sql)) return null;
    sql = sql.replace(/,\s*stynx_reader\b|\bstynx_reader\s*,\s*/gu, '');
  }
  const policy = sql.match(/^CREATE POLICY (\w+) ON (offline\.\w+)/u);
  if (policy) {
    const clause = sql.match(/\bTO ([\s\S]*?) (?:USING|WITH CHECK)/u)![1]!;
    const roles = DEFAULT_ROLES.filter((role) =>
      clause.split(',').some((value) => value.trim() === role),
    );
    const name = policyName(policy[1]!, roles, binding);
    sql = sql.replace(`CREATE POLICY ${policy[1]}`, `CREATE POLICY ${name}`);
    sql = `DROP POLICY IF EXISTS ${policy[1]} ON ${policy[2]};\n${name === policy[1] ? '' : `DROP POLICY IF EXISTS ${name} ON ${policy[2]};\n`}${sql}`;
  }
  return bindSql(sql, binding);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(',')}}`;
}
function bindCatalog(binding: StorageRoleBinding): StorageCatalogEntry[] {
  const roles = roleMap(binding);
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value.replace(
        /\bstynx_owner\b|\bstynx_app\b|\bstynx_reader\b/gu,
        (role) => roles[role]!,
      );
    if (Array.isArray(value)) return value.map(replace);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return OFFLINE_STORAGE_CATALOG.entries.flatMap((original) => {
    const entry = JSON.parse(JSON.stringify(original)) as StorageCatalogEntry;
    if (binding.readerRole === null) {
      if (['grant', 'default-grant'].includes(entry.kind) && entry.value.grantee === 'stynx_reader')
        return [];
      if (entry.kind === 'policy') {
        entry.value.roles = (entry.value.roles as string[]).filter(
          (role) => role !== 'stynx_reader',
        );
      }
    }
    if (entry.kind === 'policy') {
      const dot = entry.name.indexOf('.');
      entry.name =
        entry.name.slice(0, dot + 1) +
        policyName(entry.name.slice(dot + 1), entry.value.roles as string[], binding);
    }
    const bound = replace(entry) as StorageCatalogEntry;
    if (
      entry.kind === 'constraint' &&
      entry.value.referencedSchema === 'tenancy' &&
      entry.value.referencedTable === 'tenants'
    ) {
      bound.value.referencedSchema = binding.tenantTable.schema;
      bound.value.referencedTable = binding.tenantTable.table;
      bound.value.referencedColumns = [binding.tenantTable.column];
    }
    return [bound];
  });
}

/** Pure offline renderer; no connection, subprocess, ambient checkout or data mutation. */
export function renderOfflineStorage(options: OfflineStorageOptions = {}): OfflineStorageArtifact {
  const binding = resolveStorageRoleBinding(options);
  const { contractVersion, packageVersion } = OFFLINE_STORAGE_TEMPLATE;
  const objectsSql =
    OFFLINE_STORAGE_TEMPLATE.objects.map((sql) => bindSql(sql, binding)).join('\n\n') + '\n';
  const roleBindingsSql =
    OFFLINE_STORAGE_TEMPLATE.bindings
      .map((sql) => bindStatement(sql, binding))
      .filter((sql) => sql !== null)
      .join('\n\n') + '\n';
  return {
    contractVersion,
    packageVersion,
    binding,
    objectsSql,
    roleBindingsSql,
    manifest: {
      contractVersion,
      packageVersion,
      sources: OFFLINE_STORAGE_CATALOG.sources,
      catalog: bindCatalog(binding),
      templateSha256: createHash('sha256').update(stable(OFFLINE_STORAGE_TEMPLATE)).digest('hex'),
      dependencies: [
        'PostgreSQL gen_random_uuid(), clock_timestamp(), advisory transaction locks',
        'trusted app.tenant_id and app.actor_id transaction settings',
        'READ COMMITTED writable primary transactions for durable allocation and batch admission',
        'range FOR UPDATE locks and normalized tenant/device/nullable-shift scope fences',
        'tenant UUID key with uniqueness and configured owner migration privileges',
        'owner full visibility and fixed-order ACCESS EXCLUSIVE offline locks for atomic imports',
        'consumer maintenance and independent archived-response provenance verification',
      ],
    },
  };
}

/** Pure ordered forward SQL; caller owns prior-state admission, ledger and transactions. */
export function renderOfflineStorageMigrations(
  options: OfflineStorageOptions = {},
): OfflineStorageMigrationsArtifact {
  const binding = resolveStorageRoleBinding(options);
  const { contractVersion, packageVersion } = OFFLINE_STORAGE_TEMPLATE;
  const migrations = OFFLINE_STORAGE_TEMPLATE.migrations.map(({ source, statements }) => {
    const sql =
      statements
        .map((statement) =>
          statement.kind === 'binding'
            ? bindStatement(statement.sql, binding)
            : bindSql(statement.sql, binding),
        )
        .filter((statement) => statement !== null)
        .join('\n\n') + '\n';
    return {
      source: { ...source },
      sql,
      sqlSha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
    };
  });
  return { contractVersion, packageVersion, binding, migrations };
}

/** Verifies the live owner read-only transaction; never repairs, grants or commits. */
export function verifyOfflineStorage(
  trx: StorageVerifierTransaction,
  options: OfflineStorageOptions = {},
): Promise<StorageVerificationReport> {
  return inspectStorage(trx, renderOfflineStorage(options), 'on');
}

/** Package-internal maintenance inspection; not exported by the package entrypoint. */
export function inspectOfflineImportStorage(
  trx: StorageVerifierTransaction,
  artifact: OfflineStorageArtifact,
): Promise<StorageVerificationReport> {
  return inspectStorage(trx, artifact, 'off');
}

async function inspectStorage(
  trx: StorageVerifierTransaction,
  artifact: OfflineStorageArtifact,
  requiredReadOnly: 'on' | 'off',
): Promise<StorageVerificationReport> {
  const { binding, contractVersion, packageVersion } = artifact;
  const checks: StorageVerificationCheck[] = [];
  const report = (): StorageVerificationReport => ({
    binding,
    contractVersion,
    packageVersion,
    checks,
    supported: checks.length > 0 && checks.every((check) => check.status === 'pass'),
  });
  const check = (id: string, object: string, expected: unknown, actual: unknown): void => {
    checks.push({
      id,
      object,
      expected,
      actual,
      status: stable(expected) === stable(actual) ? 'pass' : 'fail',
    });
  };
  try {
    const admission = await executeTypedQuery(trx, storageAdmission, []
    );
    check('transaction-owner', 'transaction', binding.ownerRole, admission[0]?.owner);
    check('transaction-read-only', 'transaction', requiredReadOnly, admission[0]?.readonly);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const visibility = await executeTypedQuery(trx, storageVisibility, []
    );
    check('owner-full-row-visibility', 'offline', true, visibility[0]?.visible);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const roles = await executeTypedQuery(trx, storageRestrictedRoles,
      [binding.ownerRole, binding.appRole, binding.readerRole],
    );
    for (const name of [binding.appRole, binding.readerRole].filter((name) => name !== null)) {
      check(
        `restricted-role:${name}`,
        name,
        {
          name,
          superuser: false,
          bypass: false,
          owns: false,
          ownerMember: false,
          unsafeMembership: false,
        },
        roles.find((row) => row.name === name),
      );
    }
    const schema = await executeTypedQuery(trx, storageSchemaOwner, []
    );
    check('schema-owner', 'offline', binding.ownerRole, schema[0]?.owner);
    const expected = artifact.manifest.catalog;
    const actual = await collectStorageCatalog(trx, 'offline');
    // Additional role bindings are allowed. Their grants/policies cannot count
    // as the configured role's required grants or bypass its least-grant check.
    const relevantRoles = new Set([
      'PUBLIC',
      binding.ownerRole,
      binding.appRole,
      binding.readerRole,
    ]);
    const applicable = await executeTypedQuery(trx, storageApplicableRoles,
      [binding.appRole, binding.readerRole],
    );
    const policyRoles = new Set(['PUBLIC', ...applicable.map((row) => row.name)]);
    const relevant = (entry: StorageCatalogEntry): boolean =>
      ['grant', 'default-grant'].includes(entry.kind)
        ? typeof entry.value.grantee === 'string' && relevantRoles.has(entry.value.grantee)
        : entry.kind === 'policy'
          ? Array.isArray(entry.value.roles) && entry.value.roles.some((role: unknown) => typeof role === 'string' && policyRoles.has(role))
          : true;
    const observed = new Map(
      actual.filter(relevant).map((entry) => [`${entry.kind}:${entry.name}`, entry]),
    );
    for (const entry of expected) {
      const key = `${entry.kind}:${entry.name}`;
      // Unexpected schema definitions can contain literals that were never
      // approved for disclosure. Compare exact bytes but report their digests.
      const summary = (value: unknown): unknown =>
        value === undefined
          ? null
          : {
              sha256: createHash('sha256').update(stable(value)).digest('hex'),
            };
      check(
        `catalog:${key}`,
        `offline.${entry.name}`,
        summary(entry.value),
        summary(observed.get(key)?.value),
      );
      observed.delete(key);
    }
    for (const [key, entry] of observed)
      check(`catalog-unexpected:${key}`, `offline.${entry.name}`, null, {
        sha256: createHash('sha256').update(stable(entry.value)).digest('hex'),
      });
    const privileges = await executeTypedQuery(trx, storagePrivileges,
      [binding.appRole, binding.readerRole],
    );
    for (const row of privileges) {
      const allowed = expected.some(
        (entry) =>
          entry.kind === 'grant' &&
          typeof entry.value.object === 'string' && [row.object, row.parent].includes(entry.value.object) &&
          typeof entry.value.grantee === 'string' && [row.role, 'PUBLIC'].includes(entry.value.grantee) &&
          entry.value.privilege === row.privilege,
      );
      check(
        `effective-grant:${row.role}:${row.object}:${row.privilege}`,
        `offline.${row.object}`,
        allowed,
        row.allowed,
      );
      check(
        `effective-grant-option:${row.role}:${row.object}:${row.privilege}`,
        `offline.${row.object}`,
        false,
        row.grantable,
      );
    }
    const foreignKeys = expected.filter(
      (entry) => entry.kind === 'constraint' && entry.value.kind === 'f',
    );
    const enforcement = await executeTypedQuery(trx, storageForeignKeyEnforcement, []
    );
    check('foreign-key-enforcement', 'offline', true, enforcement[0]?.valid);
    for (const entry of foreignKeys) {
      const table = entry.name.slice(0, entry.name.indexOf('.'));
      const columns = entry.value.columns;
      const referenced = entry.value.referencedColumns;
      const targetSchema = entry.value.referencedSchema;
      const targetTable = entry.value.referencedTable;
      if (!Array.isArray(columns) || !columns.every((column): column is string => typeof column === 'string') ||
          !Array.isArray(referenced) || !referenced.every((column): column is string => typeof column === 'string') ||
          typeof targetSchema !== 'string' || typeof targetTable !== 'string') {
        throw new TypeError('Invalid foreign-key catalog binding');
      }
      const source = `offline.${quoteStorageIdentifier(table)}`;
      const orphans = await executeConfiguredQuery(trx, 'catalog.foreign-key-orphans', {
        sourceSchema: 'offline', sourceTable: table, sourceColumns: columns,
        targetSchema, targetTable, targetColumns: referenced,
      }, []);
      check(`stored-foreign-key:${entry.name}`, source, '0', orphans.rows[0]?.count);
    }
    const data = await inspectOfflineRows(trx);
    check('stored-row-invariants', 'offline', [], data);
  } catch (error) {
    checks.push({
      id: 'verification-unavailable',
      object: 'offline',
      status: 'unknown',
      reason: `Catalog or invariant verification unavailable${
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9]{5}$/u.test(error.code)
          ? ` (${error.code})`
          : ''
      }`,
    });
  }
  return report();
}
