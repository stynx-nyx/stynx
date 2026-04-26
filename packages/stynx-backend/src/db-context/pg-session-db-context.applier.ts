import type { DbContextApplier, DbSessionContext } from '@stech/stynx-contracts';

export interface PgQueryableClient {
  query(text: string, params?: readonly unknown[]): Promise<unknown>;
}

export interface PgSessionSettingMap {
  userId: string[];
  roles: string[];
  permissions: string[];
  tenantId: string[];
  correlationId: string[];
  requestId: string[];
  language: string[];
  orgCnpj: string[];
}

export interface PgSessionDbContextApplierOptions {
  enableRowSecurity?: boolean;
  clearMissing?: boolean;
  settings?: Partial<PgSessionSettingMap>;
  defaultLanguage?: string;
  languageExtraKeys?: string[];
  orgCnpjExtraKeys?: string[];
}

const DEFAULT_SETTINGS: PgSessionSettingMap = {
  userId: ['stynx.app_user_id', 'auth.app_user_id'],
  roles: ['stynx.roles', 'auth.roles'],
  permissions: ['stynx.permissions'],
  tenantId: ['stynx.current_tenant', 'auth.current_tenant', 'app.current_tenant'],
  correlationId: ['stynx.correlation_id'],
  requestId: ['stynx.request_id'],
  language: ['stynx.lang', 'auth.lang'],
  orgCnpj: ['stynx.org_cnpj', 'auth.org_cnpj'],
};

const DEFAULT_LANGUAGE_EXTRA_KEYS = ['lang', 'locale'];
const DEFAULT_ORG_CNPJ_EXTRA_KEYS = ['orgCnpj', 'org_cnpj'];

function normalizeSettingNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function normalizeList(values?: readonly string[]): string | undefined {
  if (!values || values.length === 0) return undefined;
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (normalized.length === 0) return undefined;
  return normalized.join(',');
}

function normalizeScalar(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return String(value);
}

function mergeSettings(
  overrides: Partial<PgSessionSettingMap> | undefined,
): PgSessionSettingMap {
  return {
    userId: normalizeSettingNames(overrides?.userId ?? DEFAULT_SETTINGS.userId),
    roles: normalizeSettingNames(overrides?.roles ?? DEFAULT_SETTINGS.roles),
    permissions: normalizeSettingNames(overrides?.permissions ?? DEFAULT_SETTINGS.permissions),
    tenantId: normalizeSettingNames(overrides?.tenantId ?? DEFAULT_SETTINGS.tenantId),
    correlationId: normalizeSettingNames(
      overrides?.correlationId ?? DEFAULT_SETTINGS.correlationId,
    ),
    requestId: normalizeSettingNames(overrides?.requestId ?? DEFAULT_SETTINGS.requestId),
    language: normalizeSettingNames(overrides?.language ?? DEFAULT_SETTINGS.language),
    orgCnpj: normalizeSettingNames(overrides?.orgCnpj ?? DEFAULT_SETTINGS.orgCnpj),
  };
}

/**
 * Default Postgres session context applier for stynx.
 *
 * Mirrors the proven cross-repo pattern:
 * - enables `row_security`
 * - writes request-scoped principal/tenant/session keys via `set_config(...)`
 */
export class PgSessionDbContextApplier
  implements DbContextApplier<PgQueryableClient>
{
  private readonly enableRowSecurity: boolean;
  private readonly clearMissing: boolean;
  private readonly settings: PgSessionSettingMap;
  private readonly defaultLanguage: string | undefined;
  private readonly languageExtraKeys: string[];
  private readonly orgCnpjExtraKeys: string[];

  constructor(options: PgSessionDbContextApplierOptions = {}) {
    this.enableRowSecurity = options.enableRowSecurity ?? true;
    this.clearMissing = options.clearMissing ?? true;
    this.settings = mergeSettings(options.settings);
    this.defaultLanguage = normalizeScalar(options.defaultLanguage);
    this.languageExtraKeys = options.languageExtraKeys ?? DEFAULT_LANGUAGE_EXTRA_KEYS;
    this.orgCnpjExtraKeys = options.orgCnpjExtraKeys ?? DEFAULT_ORG_CNPJ_EXTRA_KEYS;
  }

  async apply(client: PgQueryableClient, context: DbSessionContext): Promise<void> {
    if (this.enableRowSecurity) {
      await client.query('SET row_security = on');
    }

    await this.applySettings(client, this.settings.userId, normalizeScalar(context.userId));
    await this.applySettings(client, this.settings.roles, normalizeList(context.roles));
    await this.applySettings(
      client,
      this.settings.permissions,
      normalizeList(context.permissions),
    );
    await this.applySettings(client, this.settings.tenantId, normalizeScalar(context.tenantId));
    await this.applySettings(
      client,
      this.settings.correlationId,
      normalizeScalar(context.correlationId),
    );
    await this.applySettings(client, this.settings.requestId, normalizeScalar(context.requestId));

    const langFromExtras = this.resolveExtra(context, this.languageExtraKeys);
    const language = langFromExtras ?? this.defaultLanguage;
    await this.applySettings(client, this.settings.language, normalizeScalar(language));

    const orgCnpj = this.resolveExtra(context, this.orgCnpjExtraKeys);
    await this.applySettings(client, this.settings.orgCnpj, normalizeScalar(orgCnpj));
  }

  private resolveExtra(
    context: DbSessionContext,
    keys: readonly string[],
  ): string | undefined {
    const extras = context.extras;
    if (!extras) return undefined;

    for (const key of keys) {
      if (!(key in extras)) continue;
      const value = extras[key];
      const normalized = normalizeScalar(value);
      if (normalized !== undefined) {
        return normalized;
      }
    }

    return undefined;
  }

  private async applySettings(
    client: PgQueryableClient,
    settings: readonly string[],
    value: string | undefined,
  ): Promise<void> {
    if (settings.length === 0) return;
    if (value === undefined && !this.clearMissing) return;

    const normalizedValue = value ?? '';
    for (const settingName of settings) {
      await client.query('select set_config($1, $2, false)', [
        settingName,
        normalizedValue,
      ]);
    }
  }
}
