import { readOverrideSettings, writeOverrideSettings } from './i18n.repository.js';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { CatalogService } from './catalog.service.js';
import { requireI18nSystemContext, requireI18nTenantContext } from './tenant-context.js';
import type { TenantOverrideUpdateInput } from './types.js';

@Injectable()
export class I18nAdminService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly catalogService: CatalogService,
  ) {}

  async listOverrides(tenantId: string): Promise<Record<string, string>> {
    requireI18nSystemContext(this.moduleRef, tenantId);
    return this.list(tenantId, 'owner');
  }

  async listTenantOverrides(tenantId: string): Promise<Record<string, string>> {
    requireI18nTenantContext(this.moduleRef, tenantId);
    return this.list(tenantId, 'reader');
  }

  private async list(tenantId: string, role: 'owner' | 'reader'): Promise<Record<string, string>> {
    const database = this.moduleRef.get(Database, { strict: false });
    return database.txIndependent(
      async (trx) => {
        const result = await trx.run(readOverrideSettings,
          [tenantId],
        );
        const settings = result[0]?.settings ?? {};
        return Object.fromEntries(
          Object.entries(settings).filter(([key]) => key.startsWith('i18n.override.')),
        ) as Record<string, string>;
      },
      { role, readonly: true, replica: false },
    );
  }

  async updateOverrides(
    tenantId: string,
    input: TenantOverrideUpdateInput,
  ): Promise<Record<string, string>> {
    requireI18nSystemContext(this.moduleRef, tenantId);
    return this.update(tenantId, input, 'owner');
  }

  async updateTenantOverrides(
    tenantId: string,
    input: TenantOverrideUpdateInput,
  ): Promise<Record<string, string>> {
    requireI18nTenantContext(this.moduleRef, tenantId);
    return this.update(tenantId, input, 'app');
  }

  private async update(
    tenantId: string,
    input: TenantOverrideUpdateInput,
    role: 'owner' | 'app',
  ): Promise<Record<string, string>> {
    const database = this.moduleRef.get(Database, { strict: false });
    const overrides = await database.txIndependent(
      async (trx) => {
        const result = await trx.run(readOverrideSettings,
          [tenantId],
        );
        const nextSettings: Record<string, unknown> = {
          ...(result[0]?.settings ?? {}),
          ...Object.fromEntries(
            Object.entries(input.catalog).map(([key, value]) => [
              `i18n.override.${input.locale}.${key}`,
              value,
            ]),
          ),
        };
        await trx.run(writeOverrideSettings,
          [tenantId, JSON.stringify(nextSettings)],
        );
        const overrides = Object.fromEntries(
          Object.entries(nextSettings).filter(([key]) => key.startsWith('i18n.override.')),
        ) as Record<string, string>;
        return overrides;
      },
      { role, readonly: false, replica: false },
    );
    this.catalogService.setTenantOverrides(tenantId, overrides);
    return overrides;
  }
}
