import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, StynxError } from '@stynx/core';
import { createTestApp } from '@stynx/testing';
import request from 'supertest';
import { I18nAdminService } from '../../src/i18n-admin.service';
import { StynxI18nModule } from '../../src/i18n.module';
import { LocaleService } from '../../src/locale.service';

@Controller('demo')
class DemoController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly localeService: LocaleService,
  ) {}

  @Get('locale')
  locale() {
    const requestContext = this.moduleRef.get(RequestContext, { strict: false });
    return {
      locale: requestContext.locale,
      translated: this.localeService.t('TEST_GREETING', { name: 'Maria' }),
    };
  }

  @Get('error')
  error() {
    throw new StynxError(this.localeService.t('TEST_GREETING', { name: 'Maria' }), {
      code: 'TEST_GREETING',
      status: 400,
      context: { name: 'Maria' },
    });
  }
}

describe('StynxI18nModule integration', () => {
  jest.setTimeout(180_000);

  it('resolves locale order, applies tenant overrides, renders ICU messages, and localizes errors', async () => {
    const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e20111';
    const testApp = await createTestApp({
      overrides: {
        imports: [
          StynxI18nModule.forRoot({
            workspaceRoot: resolve(process.cwd(), '../..'),
            defaultLocale: 'pt-BR',
          }),
        ],
        controllers: [DemoController],
      },
    });

    try {
      const localeService = testApp.moduleRef.get(LocaleService);
      const adminService = testApp.moduleRef.get(I18nAdminService);
      const admin = await testApp.adminClient();
      try {
        await admin.query(
          `
            insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
            values ($1::uuid, 'i18n-fixture', 'I18n Fixture', true, clock_timestamp(), clock_timestamp())
          `,
          [tenantId],
        );
        await admin.query(
          `
            insert into tenancy.tenant_settings (tenant_id, locale, settings, updated_at)
            values ($1::uuid, 'pt-BR', '{}'::jsonb, clock_timestamp())
          `,
          [tenantId],
        );
      } finally {
        await admin.end();
      }

      await testApp.requestContextMutator.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId,
          locale: 'en-US',
          startedAt: new Date(),
        },
        async () => {
          await expect(localeService.resolve('pt-BR')).resolves.toBe('en-US');
        },
      );

      await testApp.requestContextMutator.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId,
          startedAt: new Date(),
        },
        async () => {
          await expect(localeService.resolve('pt-BR')).resolves.toBe('pt-BR');
          await expect(localeService.resolve(undefined)).resolves.toBe('pt-BR');
        },
      );

      expect(localeService.t('ITEM_COUNT', { count: 1 }, 'pt-BR')).toBe('1 item');
      expect(localeService.t('ITEM_COUNT', { count: 2 }, 'en-US')).toBe('2 items');

      await adminService.updateOverrides(tenantId, {
        locale: 'pt-BR',
        catalog: {
          TEST_GREETING: 'Ola da tenant, {name}!',
        },
      });

      await testApp.requestContextMutator.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId,
          locale: 'pt-BR',
          startedAt: new Date(),
        },
        async () => {
          expect(localeService.t('TEST_GREETING', { name: 'Maria' })).toBe('Ola da tenant, Maria!');
        },
      );

      const response = await request(testApp.app.getHttpServer())
        .get('/demo/error')
        .set('Accept-Language', 'pt-BR');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'TEST_GREETING',
        message: 'Ola, Maria!',
        context: { name: 'Maria' },
      });
    } finally {
      await testApp.teardown();
    }
  });
});
