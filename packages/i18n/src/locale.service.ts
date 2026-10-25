import { readTenantLocale } from './i18n.repository.js';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { CatalogService } from './catalog.service.js';
import { hasI18nTenantAdmission } from './tenant-context.js';

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

    const tenantId = hasI18nTenantAdmission(this.moduleRef) ? requestContext.tenantId : undefined;
    if (tenantId) {
      await this.catalogService.primeTenantOverrides(tenantId);
      const database = this.moduleRef.get(Database, { strict: false });
      const tenantLocale = await database.txIndependent(
        async (trx) => {
          const result = await trx.run(readTenantLocale,
            [tenantId],
          );
          return result[0]?.locale ?? undefined;
        },
        { role: 'reader', readonly: true, replica: false },
      );
      if (tenantLocale) {
        requestContextMutator.patch({ locale: tenantLocale });
        return tenantLocale;
      }
    }

    const fallback = this.catalogService.defaultLocale();
    requestContextMutator.patch({ locale: fallback });
    return fallback;
  }

  t(key: string, vars: Record<string, unknown> = {}, locale?: string): unknown {
    const requestContext = this.requestContext();
    const effectiveLocale =
      locale ??
      (requestContext.hasActiveContext() ? requestContext.locale : undefined) ??
      this.catalogService.defaultLocale();
    const tenantId = hasI18nTenantAdmission(this.moduleRef) ? requestContext.tenantId : undefined;
    return this.catalogService.translate(key, effectiveLocale, vars, tenantId);
  }

  private requestContext(): RequestContext {
    return this.moduleRef.get(RequestContext, { strict: false });
  }

  private requestContextMutator(): RequestContextMutator {
    return this.moduleRef.get(RequestContextMutator, { strict: false });
  }
}
