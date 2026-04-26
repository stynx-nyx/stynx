import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx/core';
import { Database } from '@stynx/data';
import { CatalogService } from './catalog.service';

@Injectable()
export class LocaleService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly catalogService: CatalogService,
  ) {}

  async resolve(acceptLanguage?: string): Promise<string> {
    const requestContext = this.requestContext();
    const requestContextMutator = this.requestContextMutator();
    if (requestContext.hasActiveContext() && requestContext.locale) {
      return requestContext.locale!;
    }

    const supported = this.catalogService.supportedLocales();
    const preferredFromHeader = (acceptLanguage ?? '')
      .split(',')
      .map((entry) => entry.split(';')[0]?.trim())
      .find((entry) => entry && supported.includes(entry));
    if (preferredFromHeader) {
      requestContextMutator.patch({ locale: preferredFromHeader });
      return preferredFromHeader;
    }

    const tenantId = requestContext.hasActiveContext() ? requestContext.tenantId : undefined;
    if (tenantId) {
      await this.catalogService.primeTenantOverrides(tenantId);
      const database = this.moduleRef.get(Database, { strict: false });
      const tenantLocale = await database.withSystemContext('i18n tenant locale lookup', async () =>
        database.tx(
          async (trx) => {
            const result = await trx.query<{ locale: string | null }>(
              `select locale from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
              [tenantId],
            );
            return result.rows[0]?.locale ?? undefined;
          },
          { role: 'owner', readonly: true, replica: false },
        ),
      );
      if (tenantLocale) {
        requestContextMutator.patch({ locale: tenantLocale });
        return tenantLocale;
      }
    }

    const fallback = supported.includes('pt-BR') ? 'pt-BR' : (supported[0] ?? 'en-US');
    requestContextMutator.patch({ locale: fallback });
    return fallback;
  }

  t(key: string, vars: Record<string, unknown> = {}, locale?: string): string {
    const requestContext = this.requestContext();
    const effectiveLocale = locale ?? (requestContext.hasActiveContext() ? requestContext.locale : undefined) ?? 'pt-BR';
    const tenantId = requestContext.hasActiveContext() ? requestContext.tenantId : undefined;
    return this.catalogService.translate(key, effectiveLocale, vars, tenantId);
  }

  private requestContext(): RequestContext {
    return this.moduleRef.get(RequestContext, { strict: false });
  }

  private requestContextMutator(): RequestContextMutator {
    return this.moduleRef.get(RequestContextMutator, { strict: false });
  }
}
