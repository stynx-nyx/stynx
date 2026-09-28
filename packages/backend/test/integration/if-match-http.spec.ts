import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, HttpCode, Post, UseFilters, type ArgumentsHost, type ExceptionFilter, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import request from 'supertest';
import { z } from 'zod';
import * as backend from '../../src/index';

type IfMatchApi = {
  RequireIfMatch: () => MethodDecorator;
  IfMatchRevision: () => ParameterDecorator;
  RevisionETag: () => MethodDecorator;
  IfMatchExceptionFilter: new (...args: never[]) => ExceptionFilter;
  PreconditionFailedError: new (message?: string, details?: Record<string, unknown>) => Error;
  PreconditionRequiredError: new (message?: string, details?: Record<string, unknown>) => Error;
};

const api = backend as unknown as Partial<IfMatchApi>;
const suppliedRequestId = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const schema = JSON.parse(readFileSync(resolve(__dirname, '../../../../law/schemas/error-envelope.schema.json'), 'utf8')) as {
  required: string[];
  properties: Record<string, unknown>;
};

function expectLawEnvelope(response: { status: number; body: Record<string, unknown>; headers: Record<string, string> },
  status: 412 | 428, code: string, expectedRequestId?: string): void {
  expect(response.status).toBe(status);
  for (const key of schema.required) expect(response.body).toHaveProperty(key);
  for (const key of Object.keys(response.body)) expect(Object.keys(schema.properties)).toContain(key);
  expect(response.body.statusCode).toBe(status);
  expect(response.body.errorCode).toBe(code);
  expect(response.body.message).toEqual(expect.any(String));
  expect((response.body.message as string).length).toBeGreaterThan(0);
  expect(response.body.requestId).toMatch(uuidV7);
  expect(response.body.requestId).toBe(response.headers['x-request-id']);
  if (expectedRequestId) expect(response.body.requestId).toBe(expectedRequestId);
  expect(response.headers).not.toHaveProperty('etag');
  expect(response.body).not.toHaveProperty('code');
  expect(response.body).not.toHaveProperty('context');
}

class ConsumerCatchAll implements ExceptionFilter {
  catch(_error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<{ status(code: number): { json(body: unknown): void } }>();
    res.status(599).json({ code: 'CONSUMER_GLOBAL_FILTER_WON' });
  }
}

describe('If-Match decorators on real Nest HTTP routes with StynxCoreModule', () => {
  let app: INestApplication | undefined;
  let currentRevision: number;
  const handler = vi.fn();

  beforeAll(async () => {
    for (const name of ['RequireIfMatch', 'IfMatchRevision', 'RevisionETag',
      'PreconditionFailedError', 'PreconditionRequiredError', 'IfMatchExceptionFilter'] as const) {
      expect(api[name], name).toBeTypeOf('function');
    }

    @Controller('/if-match-contract')
    class ResourceController {
      @Post('/update')
      @HttpCode(200)
      update(suppliedRevision: number) {
        handler(suppliedRevision);
        if (suppliedRevision !== currentRevision)
          throw new api.PreconditionFailedError!('Revision does not match', { currentRevision });
        currentRevision += 1;
        return { revision: currentRevision, record: { title: 'unchanged response body' } };
      }

      @Post('/bad-revision')
      @HttpCode(200)
      badRevision(_suppliedRevision: number) {
        return { record: { title: 'missing revision' } };
      }

      @Post('/explicit-filter')
      @HttpCode(200)
      explicitFilter() {
        throw new api.PreconditionFailedError!('Concurrent revision');
      }
    }

    for (const name of ['update', 'badRevision'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(ResourceController.prototype, name)!;
      api.IfMatchRevision!()(ResourceController.prototype, name, 0);
      api.RequireIfMatch!()(ResourceController.prototype, name, descriptor);
      api.RevisionETag!()(ResourceController.prototype, name, descriptor);
    }
    UseFilters(api.IfMatchExceptionFilter!)(ResourceController.prototype, 'explicitFilter',
      Object.getOwnPropertyDescriptor(ResourceController.prototype, 'explicitFilter')!);

    const module = await Test.createTestingModule({
      imports: [StynxCoreModule.forRoot({ appName: 'if-match-contract', schema: z.object({}) })],
      controllers: [ResourceController],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new ConsumerCatchAll());
    // Express auto-generated ETags would conceal whether @RevisionETag emitted one.
    app.getHttpAdapter().getInstance().disable('etag');
    await app.init();
  });

  beforeEach(() => { currentRevision = 4; handler.mockClear(); });
  afterAll(async () => { await app?.close(); });

  it.each([undefined, suppliedRequestId])('returns 428 law envelope with correlated request ID for absent If-Match (%s)', async (id) => {
    let call = request(app!.getHttpServer()).post('/if-match-contract/update');
    if (id) call = call.set('x-request-id', id);
    const response = await call.send({ title: 'ignored' });
    expectLawEnvelope(response, 428, 'PRECONDITION:REQUIRED:if-match', id);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([undefined, suppliedRequestId])('returns 412 law envelope for malformed supplied tag (%s)', async (id) => {
    let call = request(app!.getHttpServer()).post('/if-match-contract/update').set('if-match', 'W/"4"');
    if (id) call = call.set('x-request-id', id);
    const response = await call.send({ title: 'ignored' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', id);
    expect(handler).not.toHaveBeenCalled();
  });

  // HTTP parsers may remove outer OWS before Nest receives the header; the
  // exact raw-string OWS grammar is probed by the parser unit table above.
  it.each(['', 'W/"4"', '*', '"4", "5"', '"9007199254740992"'])('rejects malformed present If-Match %j before calling the handler', async (raw) => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', raw).send({ title: 'ignored' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match');
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes a safe integer revision to the handler and returns the unchanged body with the new revision ETag', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', '"4"').send({ title: 'changed' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ revision: 5, record: { title: 'unchanged response body' } });
    expect(response.headers.etag).toBe('"5"');
    expect(handler).toHaveBeenCalledExactlyOnceWith(4);
    expect(currentRevision).toBe(5);
  });

  it('uses the scoped filter for a concurrent revision error raised by the handler', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/update')
      .set('if-match', '"3"').set('x-request-id', suppliedRequestId).send({ title: 'race' });
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', suppliedRequestId);
    expect(handler).toHaveBeenCalledExactlyOnceWith(3);
    expect(currentRevision).toBe(4);
  });

  it('allows direct use of the error only with its explicitly registered filter', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/explicit-filter')
      .set('x-request-id', suppliedRequestId).send({});
    expectLawEnvelope(response, 412, 'PRECONDITION:FAILED:if-match', suppliedRequestId);
  });

  it('treats a successful body without a safe revision as a programmer error and emits no ETag', async () => {
    const response = await request(app!.getHttpServer()).post('/if-match-contract/bad-revision')
      .set('if-match', '"4"').send({});
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers).not.toHaveProperty('etag');
  });
});
