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
        const result = await trx.query<{ settings: Record<string, unknown> | null }>(
          `select settings from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
          [tenantId],
        );
        const settings = result.rows[0]?.settings ?? {};
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
        const result = await trx.query<{ settings: Record<string, unknown> | null }>(
          `select settings from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
          [tenantId],
        );
        const nextSettings: Record<string, unknown> = {
          ...(result.rows[0]?.settings ?? {}),
          ...Object.fromEntries(
            Object.entries(input.catalog).map(([key, value]) => [
              `i18n.override.${input.locale}.${key}`,
              value,
            ]),
          ),
        };
        await trx.query(
          `
              insert into tenancy.tenant_settings (tenant_id, settings, updated_at)
              values ($1::uuid, $2::jsonb, clock_timestamp())
              on conflict (tenant_id)
              do update set settings = $2::jsonb, updated_at = clock_timestamp()
            `,
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
