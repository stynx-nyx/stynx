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

@Module({
  imports: [StynxCoreModule.forRoot({ appName: 'transitive-a', schema: z.object({}) })],
})
class TransitiveCoreModuleA {}

@Module({
  imports: [StynxCoreModule.forRoot({ appName: 'transitive-b', schema: z.object({}) })],
})
class TransitiveCoreModuleB {}

@Module({
  imports: [TransitiveCoreModuleA, TransitiveCoreModuleB],
  controllers: [ContextBeforeInterceptorController],
  providers: [PreInterceptorContextGuard],
})
class ComposedPreGuardContextModule {}

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

  it('returns the filter 400 body for an invalid middleware request id', async () => {
    await request(app.getHttpServer())
      .get('/context/guard')
      .set('x-request-id', 'not-a-uuidv7')
      .expect(400)
      .expect({
        message: 'X-Request-Id must be a valid UUIDv7',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it('keeps one request id when two transitive modules import core', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ComposedPreGuardContextModule] }).compile();
    const composed = moduleRef.createNestApplication();
    await composed.init();
    try {
      await request(composed.getHttpServer())
        .get('/context/guard')
        .set('x-request-id', REQUEST_ID)
        .expect(200)
        .expect('x-request-id', REQUEST_ID)
        .expect({ requestId: REQUEST_ID });
    } finally {
      await composed.close();
    }
  });
});
