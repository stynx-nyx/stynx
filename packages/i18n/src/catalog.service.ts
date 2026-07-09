import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import IntlMessageFormat from 'intl-messageformat';
import { STYNX_I18N_OPTIONS } from './tokens';
import type { StynxI18nModuleOptions } from './types';

type Catalogs = Map<string, Map<string, string>>;

function loadJsonCatalog(filePath: string): Record<string, string> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, string>;
}

@Injectable()
export class CatalogService {
  private catalogs?: Catalogs;
  private readonly tenantOverrideCache = new Map<string, Record<string, string>>();

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_I18N_OPTIONS)
    private readonly options: StynxI18nModuleOptions,
  ) {}

  supportedLocales(): string[] {
    return [...this.catalogsMap().keys()];
  }

  translate(key: string, locale: string, vars: Record<string, unknown> = {}, tenantId?: string): string {
    const catalogs = this.catalogsMap();
    const layered = this.mergeTenantOverrides(catalogs, tenantId);
    const exact = layered.get(locale)?.get(key);
    if (exact) {
      return new IntlMessageFormat(exact, locale).format(vars) as string;
    }

    const fallback = layered.get('en-US')?.get(key);
    if (fallback) {
      return new IntlMessageFormat(fallback, 'en-US').format(vars) as string;
    }

    return key;
  }

  async primeTenantOverrides(tenantId: string): Promise<void> {
    if (this.tenantOverrideCache.has(tenantId)) {
      return;
    }
    this.tenantOverrideCache.set(tenantId, await this.tenantOverrides(tenantId));
  }

  setTenantOverrides(tenantId: string, overrides: Record<string, string>): void {
    this.tenantOverrideCache.set(tenantId, overrides);
  }

  async tenantOverrides(tenantId: string): Promise<Record<string, string>> {
    const database = this.moduleRef.get(Database, { strict: false });
    return database.withSystemContext('i18n tenant override lookup', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ settings: Record<string, unknown> | null }>(
            `select settings from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
            [tenantId],
          );
          const settings = result.rows[0]?.settings ?? {};
          return Object.fromEntries(
            Object.entries(settings).filter(([entryKey]) => entryKey.startsWith('i18n.override.')),
          ) as Record<string, string>;
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  private catalogsMap(): Catalogs {
    if (!this.catalogs) {
      this.catalogs = this.loadCatalogs();
    }
    return this.catalogs;
  }

  private loadCatalogs(): Catalogs {
    const workspaceRoot = this.options.workspaceRoot ?? process.cwd();
    const packageRoots = ['packages', 'packages-web']
      .map((segment) => resolve(workspaceRoot, segment))
      .filter((candidate) => {
        try {
          return statSync(candidate).isDirectory();
        } catch {
          return false;
        }
      });

    const catalogs: Catalogs = new Map();
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
          const target = catalogs.get(locale) ?? new Map<string, string>();
          for (const [key, value] of Object.entries(loadJsonCatalog(join(i18nDir, entry)))) {
            target.set(key, value);
          }
          catalogs.set(locale, target);
        }
      }
    }

    if (!catalogs.has('en-US')) {
      catalogs.set('en-US', new Map());
    }
    if (!catalogs.has(this.options.defaultLocale ?? 'pt-BR')) {
      catalogs.set(this.options.defaultLocale ?? 'pt-BR', new Map());
    }
    return catalogs;
  }

  private mergeTenantOverrides(catalogs: Catalogs, tenantId?: string): Catalogs {
    if (!tenantId) {
      return catalogs;
    }

    const overrides = this.tenantOverrideCache.get(tenantId);
    if (!overrides) {
      return catalogs;
    }

    const merged: Catalogs = new Map([...catalogs.entries()].map(([locale, catalog]) => [locale, new Map(catalog)]));
    for (const [key, value] of Object.entries(overrides)) {
      const match = /^i18n\.override\.([^.]+)\.(.+)$/u.exec(key);
      if (!match) {
        continue;
      }
      const locale = match[1]!;
      const catalogKey = match[2]!;
      const target = merged.get(locale) ?? new Map<string, string>();
      target.set(catalogKey, value);
      merged.set(locale, target);
    }
    return merged;
  }
}
