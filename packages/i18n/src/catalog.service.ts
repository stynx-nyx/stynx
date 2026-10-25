import { readOverrideSettings } from './i18n.repository.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import IntlMessageFormat from 'intl-messageformat';
import { STYNX_I18N_OPTIONS } from './tokens.js';
import type { I18nCatalogMessages, I18nTenantOverrides, StynxI18nModuleOptions } from './types.js';
import { requireI18nCacheContext } from './tenant-context.js';

type Catalogs = Map<string, Map<string, unknown>>;

export const STYNX_I18N_DEFAULT_LOCALE = 'en-US';

function loadJsonCatalogEntries(filePath: string): [string, unknown][] {
  const value: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (value === null || value === undefined) {
    // Preserve Object.entries' native nullish failure at the original consumption boundary.
    Reflect.apply(Object.entries, Object, [value]);
    throw new Error('Native Object.entries unexpectedly accepted a nullish catalog');
  }
  return Object.entries(value);
}

function formatCatalogMessage(
  message: unknown,
  locale: string,
  vars: Record<string, unknown>,
): unknown {
  // This fixed native constructor owns its accepted ICU representations and errors.
  const formatter: unknown = Reflect.construct(IntlMessageFormat, [message, locale]);
  if (!(formatter instanceof IntlMessageFormat)) {
    throw new Error('Native IntlMessageFormat returned an unexpected instance');
  }
  return formatter.format(vars);
}

@Injectable()
export class CatalogService {
  private catalogs?: Catalogs;
  private readonly tenantOverrideCache = new Map<string, I18nTenantOverrides>();

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_I18N_OPTIONS)
    private readonly options: StynxI18nModuleOptions,
  ) {}

  supportedLocales(): string[] {
    return [...this.catalogsMap().keys()];
  }

  /** The configured default locale, `en-US` unless `defaultLocale` is set. */
  defaultLocale(): string {
    return this.options.defaultLocale ?? STYNX_I18N_DEFAULT_LOCALE;
  }

  /**
   * Registers (or extends) one locale's catalog. Modules call this, for
   * example from `onModuleInit`, instead of shipping files the service scans.
   * Later registrations of a key override earlier ones.
   */
  registerCatalog(locale: string, messages: I18nCatalogMessages): void {
    const catalogs = this.catalogsMap();
    const target = catalogs.get(locale) ?? new Map<string, unknown>();
    for (const [key, value] of Object.entries(messages)) {
      target.set(key, value);
    }
    catalogs.set(locale, target);
  }

  translate(
    key: string,
    locale: string,
    vars: Record<string, unknown> = {},
    tenantId?: string,
  ): unknown {
    if (tenantId !== undefined) requireI18nCacheContext(this.moduleRef, tenantId);
    const catalogs = this.catalogsMap();
    const layered = this.mergeTenantOverrides(catalogs, tenantId);
    const exact = layered.get(locale)?.get(key);
    if (exact) {
      return formatCatalogMessage(exact, locale, vars);
    }

    const fallback = layered.get(STYNX_I18N_DEFAULT_LOCALE)?.get(key);
    if (fallback) {
      return formatCatalogMessage(fallback, 'en-US', vars);
    }

    return key;
  }

  async primeTenantOverrides(tenantId: string): Promise<void> {
    requireI18nCacheContext(this.moduleRef, tenantId);
    if (this.tenantOverrideCache.has(tenantId)) {
      return;
    }
    this.setTenantOverrides(tenantId, await this.tenantOverrides(tenantId));
  }

  setTenantOverrides(tenantId: string, overrides: I18nTenantOverrides): void {
    requireI18nCacheContext(this.moduleRef, tenantId);
    this.tenantOverrideCache.set(tenantId, { ...overrides });
  }

  async tenantOverrides(tenantId: string): Promise<I18nTenantOverrides> {
    const scope = requireI18nCacheContext(this.moduleRef, tenantId);
    const database = this.moduleRef.get(Database, { strict: false });
    return database.txIndependent(
      async (trx) => {
        const result = await trx.run(readOverrideSettings, [tenantId]);
        const settings = result[0]?.settings ?? {};
        return Object.fromEntries(
          Object.entries(settings).filter(([entryKey]) => entryKey.startsWith('i18n.override.')),
        );
      },
      { role: scope === 'tenant' ? 'reader' : 'owner', readonly: true, replica: false },
    );
  }

  private catalogsMap(): Catalogs {
    if (!this.catalogs) {
      this.catalogs = this.loadCatalogs();
    }
    return this.catalogs;
  }

  private loadCatalogs(): Catalogs {
    const catalogs: Catalogs = new Map();
    for (const [locale, messages] of Object.entries(this.options.catalogs ?? {})) {
      catalogs.set(locale, new Map(Object.entries(messages)));
    }
    if (this.options.workspaceRoot !== undefined) {
      this.scanWorkspaceCatalogs(this.options.workspaceRoot, catalogs);
    }

    if (!catalogs.has(STYNX_I18N_DEFAULT_LOCALE)) {
      catalogs.set(STYNX_I18N_DEFAULT_LOCALE, new Map());
    }
    if (!catalogs.has(this.defaultLocale())) {
      catalogs.set(this.defaultLocale(), new Map());
    }
    return catalogs;
  }

  private scanWorkspaceCatalogs(workspaceRoot: string, catalogs: Catalogs): void {
    const packageRoots = ['packages', 'packages-web']
      .map((segment) => resolve(workspaceRoot, segment))
      .filter((candidate) => {
        try {
          return statSync(candidate).isDirectory();
        } catch {
          return false;
        }
      });

    for (const packageRoot of packageRoots) {
      for (const packageName of readdirSync(packageRoot)) {
        const i18nDir = join(packageRoot, packageName, 'i18n');
        try {
          if (!statSync(i18nDir).isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        for (const entry of readdirSync(i18nDir)) {
          if (!entry.endsWith('.json')) {
            continue;
          }
          const locale = entry.replace(/\.json$/u, '');
          const target = catalogs.get(locale) ?? new Map<string, unknown>();
          for (const [key, value] of loadJsonCatalogEntries(join(i18nDir, entry))) {
            target.set(key, value);
          }
          catalogs.set(locale, target);
        }
      }
    }
  }

  private mergeTenantOverrides(catalogs: Catalogs, tenantId?: string): Catalogs {
    if (!tenantId) {
      return catalogs;
    }

    const overrides = this.tenantOverrideCache.get(tenantId);
    if (!overrides) {
      return catalogs;
    }

    const merged: Catalogs = new Map(
      [...catalogs.entries()].map(([locale, catalog]) => [locale, new Map(catalog)]),
    );
    for (const [key, value] of Object.entries(overrides)) {
      const match = /^i18n\.override\.([^.]+)\.(.+)$/u.exec(key);
      if (!match) {
        continue;
      }
      const locale = match[1]!;
      const catalogKey = match[2]!;
      const target = merged.get(locale) ?? new Map<string, unknown>();
      target.set(catalogKey, value);
      merged.set(locale, target);
    }
    return merged;
  }
}
