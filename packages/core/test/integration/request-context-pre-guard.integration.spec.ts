import { CanActivate, Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { StynxCoreModule } from '../../src/core.module';
import { RequestContext } from '../../src/request-context';

const REQUEST_ID = '0190abcd-1234-7abc-89ab-0123456789ab';

@Injectable()
class PreInterceptorContextGuard implements CanActivate {
  seen: { requestId: string; locale?: string } | undefined;

  constructor(private readonly context: RequestContext) {}

  canActivate(_executionContext: ExecutionContext): boolean {
    this.seen = {
      requestId: this.context.requestId,
      locale: this.context.locale,
    };
    return true;
  }
}

@Controller('/context')
@UseGuards(PreInterceptorContextGuard)
class ContextBeforeInterceptorController {
  constructor(private readonly context: RequestContext) {}

  @Get('/guard')
  handler() {
    return { requestId: this.context.requestId, locale: this.context.locale };
  }
}

@Module({
  imports: [StynxCoreModule.forRoot({ appName: 'pre-guard-context', schema: z.object({}) })],
  controllers: [ContextBeforeInterceptorController],
  providers: [PreInterceptorContextGuard],
})
class PreGuardContextModule {}

describe('RequestContext before Nest guards', () => {
  let app: INestApplication;
  let guard: PreInterceptorContextGuard;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PreGuardContextModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    guard = moduleRef.get(PreInterceptorContextGuard);
  });

  afterAll(async () => app?.close());

  it('seeds request id and locale before a guard runs, then echoes the same id', async () => {
    await request(app.getHttpServer())
      .get('/context/guard')
      .set('x-request-id', REQUEST_ID)
      .set('accept-language', 'pt-BR, en;q=0.9')
      .expect(200)
      .expect('x-request-id', REQUEST_ID)
      .expect({ requestId: REQUEST_ID, locale: 'pt-BR' });

    expect(guard.seen).toEqual({ requestId: REQUEST_ID, locale: 'pt-BR' });
  });
});
