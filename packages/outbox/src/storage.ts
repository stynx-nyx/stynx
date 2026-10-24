import { outboxStorageAdmission, outboxStorageVisibility, outboxStorageRoles, outboxStorageSchema, outboxStorageApplicable, outboxStoragePrivileges, outboxStorageEnforcement, outboxStorageMarker, outboxStorageData, outboxStorageSequence } from './storage.repository.js';
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
import { OUTBOX_STORAGE_TEMPLATE } from './storage-template.generated.js';
import { OUTBOX_STORAGE_CATALOG } from './storage-catalog.generated.js';

export type OutboxStorageOptions = StorageBindingOptions;
export interface OutboxStorageManifest {
  contractVersion: string;
  packageVersion: string;
  sources: readonly { path: string; sha256: string }[];
  catalog: readonly StorageCatalogEntry[];
  dependencies: readonly string[];
  templateSha256: string;
}
export interface OutboxStorageArtifact {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  objectsSql: string;
  roleBindingsSql: string;
  manifest: OutboxStorageManifest;
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
    .replace(
      /'(stynx_owner|stynx_app|stynx_reader)'|\b(stynx_owner|stynx_app|stynx_reader)\b/gu,
      (_whole, literal: string | undefined, identifier: string | undefined) => {
        const value = roles[literal ?? identifier!]!;
        return literal ? `'${value.replaceAll("'", "''")}'` : quoteStorageIdentifier(value);
      },
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
  const policy = sql.match(/^CREATE POLICY (\w+) ON (outbox\.\w+)/u);
  if (policy) {
    const roles = DEFAULT_ROLES.filter((role) => sql.includes(`TO ${role}`));
    const name = policyName(policy[1]!, roles, binding);
    sql = sql.replace(`CREATE POLICY ${policy[1]}`, `CREATE POLICY ${name}`);
    sql = `DROP POLICY IF EXISTS ${name} ON ${policy[2]};\n${sql}`;
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
  return OUTBOX_STORAGE_CATALOG.entries.flatMap((original) => {
    const entry = JSON.parse(JSON.stringify(original)) as StorageCatalogEntry;
    if (
      binding.readerRole === null &&
      ((['grant', 'default-grant'].includes(entry.kind) &&
        entry.value.grantee === 'stynx_reader') ||
        (entry.kind === 'policy' && (entry.value.roles as string[]).includes('stynx_reader')))
    )
      return [];
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
export function renderOutboxStorage(options: OutboxStorageOptions = {}): OutboxStorageArtifact {
  const binding = resolveStorageRoleBinding(options);
  const { contractVersion, packageVersion } = OUTBOX_STORAGE_TEMPLATE;
  const objectsSql =
    OUTBOX_STORAGE_TEMPLATE.objects.map((sql) => bindSql(sql, binding)).join('\n\n') + '\n';
  const roleBindingsSql =
    OUTBOX_STORAGE_TEMPLATE.bindings
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
      sources: OUTBOX_STORAGE_CATALOG.sources,
      catalog: bindCatalog(binding),
      templateSha256: createHash('sha256').update(stable(OUTBOX_STORAGE_TEMPLATE)).digest('hex'),
      dependencies: [
        'PostgreSQL gen_random_uuid(), clock_timestamp(), nextval(), advisory transaction locks',
        'stynx.audit_chain_key transaction GUC binds one exact tenant chain per transaction',
        'pg_advisory_xact_lock(hashtextextended(tenant_id::text,0)) precedes clock/event writes',
        'outbox.legacy_ownership singleton FOR SHARE for append; FOR UPDATE for cutover',
        'trusted app.tenant_id, app.actor_id and app.role transaction settings',
        'READ COMMITTED writable primary app transactions for append and delivery mutations',
        'tenant UUID key with uniqueness and configured owner migration privileges',
        'platform audit chain only for platform legacy cutover; consumer-owned cutover unsupported',
      ],
    },
  };
}

/** Verifies the live owner read-only transaction; never repairs, grants or commits. */
export async function verifyOutboxStorage(
  trx: StorageVerifierTransaction,
  options: OutboxStorageOptions = {},
): Promise<StorageVerificationReport> {
  const artifact = renderOutboxStorage(options);
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
    const admission = await executeTypedQuery(trx, outboxStorageAdmission, []);
    check('transaction-owner', 'transaction', binding.ownerRole, admission[0]?.owner);
    check('transaction-read-only', 'transaction', 'on', admission[0]?.readonly);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const visibility = await executeTypedQuery(trx, outboxStorageVisibility, []);
    check('owner-full-row-visibility', 'outbox', true, visibility[0]?.visible);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const roles = await executeTypedQuery(trx, outboxStorageRoles,
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
    const schema = await executeTypedQuery(trx, outboxStorageSchema, []);
    check('schema-owner', 'outbox', binding.ownerRole, schema[0]?.owner);
    const expected = artifact.manifest.catalog;
    const actual = await collectStorageCatalog(trx, 'outbox');
    // Additional role bindings are allowed. Their grants/policies cannot count
    // as the configured role's required grants or bypass its least-grant check.
    const relevantRoles = new Set([
      'PUBLIC',
      binding.ownerRole,
      binding.appRole,
      binding.readerRole,
    ]);
    const applicable = await executeTypedQuery(trx, outboxStorageApplicable,
      [binding.appRole, binding.readerRole],
    );
    const policyRoles = new Set(['PUBLIC', ...applicable.map((row) => row.name)]);
    const relevant = (entry: StorageCatalogEntry): boolean =>
      ['grant', 'default-grant'].includes(entry.kind)
        ? relevantRoles.has(entry.value.grantee as string)
        : entry.kind === 'policy'
          ? (entry.value.roles as string[]).some((role) => policyRoles.has(role))
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
        `outbox.${entry.name}`,
        summary(entry.value),
        summary(observed.get(key)?.value),
      );
      observed.delete(key);
    }
    for (const [key, entry] of observed)
      check(`catalog-unexpected:${key}`, `outbox.${entry.name}`, null, {
        sha256: createHash('sha256').update(stable(entry.value)).digest('hex'),
      });
    const privileges = await executeTypedQuery(trx, outboxStoragePrivileges,
      [binding.appRole, binding.readerRole],
    );
    for (const row of privileges) {
      const allowed = expected.some(
        (entry) =>
          entry.kind === 'grant' &&
          [row.object, row.parent].includes(entry.value.object as string) &&
          [row.role, 'PUBLIC'].includes(entry.value.grantee as string) &&
          entry.value.privilege === row.privilege,
      );
      check(
        `effective-grant:${row.role}:${row.object}:${row.privilege}`,
        `outbox.${row.object}`,
        allowed,
        row.allowed,
      );
      check(
        `effective-grant-option:${row.role}:${row.object}:${row.privilege}`,
        `outbox.${row.object}`,
        false,
        row.grantable,
      );
    }
    const foreignKeys = expected.filter(
      (entry) => entry.kind === 'constraint' && entry.value.kind === 'f',
    );
    const enforcement = await executeTypedQuery(trx, outboxStorageEnforcement, []);
    check('foreign-key-enforcement', 'outbox', true, enforcement[0]?.valid);
    for (const entry of foreignKeys) {
      const table = entry.name.slice(0, entry.name.indexOf('.'));
      const columns = entry.value.columns as string[];
      const referenced = entry.value.referencedColumns as string[];
      const source = `outbox.${quoteStorageIdentifier(table)}`;
      const orphans = await executeConfiguredQuery(trx, 'catalog.foreign-key-orphans', {
        sourceSchema: 'outbox', sourceTable: table, sourceColumns: columns,
        targetSchema: entry.value.referencedSchema as string,
        targetTable: entry.value.referencedTable as string,
        targetColumns: referenced,
      }, []);
      check(`stored-foreign-key:${entry.name}`, source, '0', orphans.rows[0]?.count);
    }
    const marker = await executeTypedQuery(trx, outboxStorageMarker, []);
    check('ownership-marker', 'outbox.legacy_ownership', true, marker[0]?.valid);
    const data = await executeTypedQuery(trx, outboxStorageData, []);
    check('stored-row-invariants', 'outbox', [], [...data]);
    const sequence = await executeTypedQuery(trx, outboxStorageSequence, []);
    check('cursor-sequence-available', 'outbox.event_order_seq', true, sequence[0]?.available);
  } catch (error) {
    checks.push({
      id: 'verification-unavailable',
      object: 'outbox',
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
