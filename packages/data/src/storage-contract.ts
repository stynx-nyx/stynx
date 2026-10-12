/** Consumer storage bindings use separate validated PostgreSQL identifiers. */
export interface StorageRoleBinding {
  ownerRole: string;
  appRole: string;
  readerRole: string | null;
  tenantTable: { schema: string; table: string; column: string };
}

export interface StorageBindingOptions {
  ownerRole?: string;
  appRole?: string;
  readerRole?: string | null;
  tenantTable?: { schema: string; table: string; column: string };
}

/** Compatible with a consumer client or a STYNX transaction; no connection ownership. */
export interface StorageVerifierTransaction {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface StorageVerificationCheck {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  object: string;
  tenantId?: string;
  expected?: unknown;
  actual?: unknown;
  reason?: string;
}

export interface StorageVerificationReport {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  supported: boolean;
  checks: readonly StorageVerificationCheck[];
}

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_$]*$/u;

/** Rejects fragments, truncation aliases and malformed Unicode before quoting. */
export function quoteStorageIdentifier(value: string): string {
  if (
    typeof value !== 'string' ||
    Buffer.from(value, 'utf8').toString('utf8') !== value ||
    !IDENTIFIER.test(value) ||
    Buffer.byteLength(value, 'utf8') > 63
  ) {
    throw new RangeError(
      'Storage binding requires a PostgreSQL identifier of at most 63 UTF-8 bytes',
    );
  }
  return `"${value}"`;
}

export function resolveStorageRoleBinding(options: StorageBindingOptions = {}): StorageRoleBinding {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !['ownerRole', 'appRole', 'readerRole', 'tenantTable'].includes(key),
    )
  ) {
    throw new RangeError('Unknown storage binding option');
  }
  const binding: StorageRoleBinding = {
    ownerRole: options.ownerRole === undefined ? 'stynx_owner' : options.ownerRole,
    appRole: options.appRole === undefined ? 'stynx_app' : options.appRole,
    readerRole: options.readerRole === undefined ? 'stynx_reader' : options.readerRole,
    tenantTable:
      options.tenantTable === undefined
        ? { schema: 'tenancy', table: 'tenants', column: 'id' }
        : { ...options.tenantTable },
  };
  if (
    options.tenantTable !== undefined &&
    (options.tenantTable === null ||
      typeof options.tenantTable !== 'object' ||
      Array.isArray(options.tenantTable) ||
      Object.keys(options.tenantTable).sort().join(',') !== 'column,schema,table')
  ) {
    throw new RangeError('Storage tenant table requires schema, table and column identifiers');
  }
  for (const value of [
    binding.ownerRole,
    binding.appRole,
    binding.tenantTable.schema,
    binding.tenantTable.table,
    binding.tenantTable.column,
  ])
    quoteStorageIdentifier(value);
  if (binding.readerRole !== null) quoteStorageIdentifier(binding.readerRole);
  const roles = [binding.ownerRole, binding.appRole, binding.readerRole].filter(
    (value) => value !== null,
  );
  if (
    new Set(roles).size !== roles.length ||
    roles.some((value) => value.toLowerCase() === 'public')
  ) {
    throw new RangeError('Storage roles must be distinct named roles');
  }
  return binding;
}
