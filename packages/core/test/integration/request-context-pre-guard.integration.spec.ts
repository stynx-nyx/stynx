import { CanActivate, Controller, Get, Injectable, Module, UseGuards } from '@nestjs/common';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { StynxCoreModule } from '../../src/core.module.js';
import { RequestContext } from '../../src/request-context.js';

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

@Controller()
class ProbeController {
  @Get('/healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('/readyz')
  readiness() {
    return { status: 'ready' };
  }

  @Get('/healthz/deep')
  deep() {
    return { status: 'deep' };
  }
}

@Module({
  imports: [StynxCoreModule.forRoot({ appName: 'pre-guard-context', schema: z.object({}) })],
  controllers: [ContextBeforeInterceptorController, ProbeController],
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
    guard.seen = undefined;
    const response = await request(app.getHttpServer())
      .get('/context/guard')
      .set('x-request-id', 'not-a-uuidv7')
      .expect(400)
      .expect({ code: 'VALIDATION', messageKey: 'REQUEST_ID_INVALID', requestId: null });
    expect(Object.keys(response.body as object).sort()).toEqual(['code', 'messageKey', 'requestId']);
    expect(response.headers['x-request-id']).toBe(undefined);
    expect(guard.seen).toBe(undefined);
  });

  it('rejects a missing request id exactly like an invalid one, before any guard (SM-15)', async () => {
    guard.seen = undefined;
    const missing = await request(app.getHttpServer())
      .post('/context/guard')
      .set('authorization', 'Bearer not-checked')
      .expect(400);
    const invalid = await request(app.getHttpServer())
      .post('/context/guard')
      .set('x-request-id', 'not-a-uuidv7')
      .expect(400);

    expect(missing.body).toEqual({ code: 'VALIDATION', messageKey: 'REQUEST_ID_INVALID', requestId: null });
    expect(Object.keys(missing.body as object).sort()).toEqual(['code', 'messageKey', 'requestId']);
    expect(missing.body).toEqual(invalid.body);
    expect(missing.headers['x-request-id']).toBe(undefined);
    expect(guard.seen).toBe(undefined);
  });

  it('serves /healthz and /readyz probes without a request id or context (D-072)', async () => {
    const live = await request(app.getHttpServer()).get('/healthz').expect(200).expect({ status: 'ok' });
    const ready = await request(app.getHttpServer())
      .get('/readyz?full=1')
      .expect(200)
      .expect({ status: 'ready' });
    await request(app.getHttpServer()).head('/healthz').expect(200);

    expect(live.headers['x-request-id']).toBe(undefined);
    expect(ready.headers['x-request-id']).toBe(undefined);
  });

  it('still holds a probe that sends an id to the UUIDv7 rule (D-072)', async () => {
    await request(app.getHttpServer())
      .get('/healthz')
      .set('x-request-id', 'not-a-uuidv7')
      .expect(400)
      .expect({ code: 'VALIDATION', messageKey: 'REQUEST_ID_INVALID', requestId: null });
    await request(app.getHttpServer())
      .get('/readyz')
      .set('x-request-id', REQUEST_ID)
      .expect(200)
      .expect('x-request-id', REQUEST_ID);
  });

  it('rejects a missing request id on any path other than the exact probes (D-072)', async () => {
    await request(app.getHttpServer())
      .get('/healthz/deep')
      .expect(400)
      .expect({ code: 'VALIDATION', messageKey: 'REQUEST_ID_INVALID', requestId: null });
    await request(app.getHttpServer())
      .post('/healthz')
      .expect(400)
      .expect({ code: 'VALIDATION', messageKey: 'REQUEST_ID_INVALID', requestId: null });
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
