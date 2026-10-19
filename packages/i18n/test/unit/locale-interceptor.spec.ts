import { resolve } from 'node:path';
import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  RequestContext,
  RequestContextMutator,
  StynxCoreModule,
  generateRequestId,
} from '@stynx-nyx/core';
import { lastValueFrom, of } from 'rxjs';
import { z } from 'zod';
import { CatalogService } from '../../src/catalog.service.js';
import { LocaleService } from '../../src/locale.service.js';
import { LocaleInterceptor } from '../../src/locale.interceptor.js';

/** A manual public constructor consumer supplies no authenticated tenancy proof. */
describe('LocaleInterceptor standalone compatibility', () => {
  it('retains its one-argument constructor and global locale behavior without admitting a warm tenant cache', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StynxCoreModule.forRoot({ appName: 'i18n-manual-consumer', schema: z.object({}) })],
    }).compile();
    await moduleRef.init();
    try {
      const catalog = new CatalogService(moduleRef, {
        workspaceRoot: resolve(process.cwd(), '../..'),
      });
      const locale = new LocaleService(moduleRef, catalog);
      const interceptor = new LocaleInterceptor(locale);
      const request = { headers: { 'accept-language': 'pt-BR', 'x-tenant-id': 'manual-tenant' } };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      await moduleRef.get(RequestContextMutator).runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: 'manual-tenant',
          actorId: 'manual-actor',
          startedAt: new Date(),
        },
        async () => {
          catalog.setTenantOverrides('manual-tenant', {
            'i18n.override.pt-BR.ITEM_COUNT': 'Tenant secret',
          });
          expect(locale.t('ITEM_COUNT', { count: 2 }, 'pt-BR')).toBe('Tenant secret');
          // The actual locale/catalog services have no Database provider. Any
          // attempted tenant SQL would fail; the interceptor has no proof port.
          const result = await lastValueFrom(
            interceptor.intercept(context, {
              handle: () =>
                of({
                  locale: moduleRef.get(RequestContext).locale,
                  translated: locale.t('ITEM_COUNT', { count: 2 }),
                }),
            }),
          );
          expect(result).toEqual({ locale: 'pt-BR', translated: '2 itens' });
          // Teardown must not leak HTTP-origin admission into its internal caller.
          expect(locale.t('ITEM_COUNT', { count: 2 }, 'pt-BR')).toBe('Tenant secret');
        },
      );
    } finally {
      await moduleRef.close();
    }
  });
});
