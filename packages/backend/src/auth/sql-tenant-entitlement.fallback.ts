import { executeConfiguredQuery } from '@stynx-nyx/data';
import type { TenantEntitlementContext } from '@stynx-nyx/contracts';
import type { TenantEntitlementFallback } from './claim-first-tenant-entitlement.policy.js';

type RowResult<T> = { rows: T[] } | T[];

export interface TenantEntitlementSqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<RowResult<T>>;
}

export interface SqlTenantEntitlementFallbackOptions {
  executor: TenantEntitlementSqlExecutor;
  table?: string;
  tenantColumn?: string;
  subjectColumn?: string;
  emailColumn?: string;
  activeColumn?: string | null;
}

function isIdentifierPart(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

function assertIdentifierPath(value: string, name: string): string {
  const parts = value.split('.');
  if (parts.length === 0 || !parts.every(isIdentifierPart)) {
    throw new Error(`Invalid SQL identifier for ${name}: ${value}`);
  }
  return parts.join('.');
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Optional fallback checker for ClaimFirstTenantEntitlementPolicy.
 * Mirrors PEC DB fallback behavior over local `auth.users` records.
 */
export class SqlTenantEntitlementFallback implements TenantEntitlementFallback {
  private readonly table: string;
  private readonly tenantColumn: string;
  private readonly subjectColumn: string;
  private readonly emailColumn: string;
  private readonly activeColumn: string | null;

  constructor(private readonly options: SqlTenantEntitlementFallbackOptions) {
    this.table = assertIdentifierPath(options.table ?? 'auth.users', 'table');
    this.tenantColumn = assertIdentifierPath(
      options.tenantColumn ?? 'tenant_id',
      'tenantColumn',
    );
    this.subjectColumn = assertIdentifierPath(
      options.subjectColumn ?? 'oidc_sub',
      'subjectColumn',
    );
    this.emailColumn = assertIdentifierPath(
      options.emailColumn ?? 'email',
      'emailColumn',
    );
    this.activeColumn =
      options.activeColumn === null
        ? null
        : assertIdentifierPath(options.activeColumn ?? 'is_active', 'activeColumn');
  }

  async isEntitled(context: TenantEntitlementContext): Promise<boolean> {
    const subject =
      normalizeText(context.principal.claims.sub) ?? normalizeText(context.principal.id);
    const email =
      normalizeText(context.principal.email) ??
      normalizeText(context.principal.claims.email);

    if (!subject && !email) {
      return false;
    }

    const result = await executeConfiguredQuery(this.options.executor, 'auth.tenant-entitlement', {
      table: this.table, tenantColumn: this.tenantColumn, subjectColumn: this.subjectColumn,
      emailColumn: this.emailColumn, activeColumn: this.activeColumn,
    }, [context.tenantId, subject, email]);
    const rows = result.rows;

    return rows.length > 0;
  }
}

