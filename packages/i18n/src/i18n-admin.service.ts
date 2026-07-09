import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { CatalogService } from './catalog.service';
import type { TenantOverrideUpdateInput } from './types';

@Injectable()
export class I18nAdminService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly catalogService: CatalogService,
  ) {}

  async listOverrides(tenantId: string): Promise<Record<string, string>> {
    const database = this.moduleRef.get(Database, { strict: false });
    return database.withSystemContext('i18n override listing', async () =>
      database.tx(
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
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  async updateOverrides(tenantId: string, input: TenantOverrideUpdateInput): Promise<Record<string, string>> {
    const database = this.moduleRef.get(Database, { strict: false });
    return database.withSystemContext('i18n override update', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ settings: Record<string, unknown> | null }>(
            `select settings from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
            [tenantId],
          );
          const nextSettings: Record<string, unknown> = {
            ...(result.rows[0]?.settings ?? {}),
            ...Object.fromEntries(
              Object.entries(input.catalog).map(([key, value]) => [`i18n.override.${input.locale}.${key}`, value]),
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
          this.catalogService.setTenantOverrides(tenantId, overrides);
          return overrides;
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );
  }
}
