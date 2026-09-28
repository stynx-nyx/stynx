import 'reflect-metadata';
import { Controller, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import request from 'supertest';
import { z } from 'zod';
import * as backend from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';

function expectModuleRequiredEnvelope(response: { status: number; body: unknown; headers: Record<string, string | undefined> }): void {
  expect(response.status).toBe(503);
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(response.body).toEqual({ statusCode: 503, errorCode: 'COMMAND:UNAVAILABLE:module-required',
    message: 'Transactional command module is required', requestId, retryable: false });
}

describe('transactional command without its module over real Nest HTTP', () => {
  it('rejects a marked protected POST before its handler while its unmarked sibling retains POST 201', async () => {
    const command = (backend as unknown as { TransactionalCommand?: () => MethodDecorator }).TransactionalCommand;
    expect(command).toBeTypeOf('function');
    const handler = vi.fn(() => ({ id: 'must-not-run' }));

    @Controller('/command-absent-module')
    @UseGuards(AuthContextGuard)
    class CommandController {
      @Post('/marked')
      marked() { return handler(); }

      @Post('/legacy')
      legacy() { return { id: 'legacy' }; }
    }
    command!()(CommandController.prototype, 'marked', Object.getOwnPropertyDescriptor(CommandController.prototype, 'marked')!);

    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'command-absent-module', schema: z.object({}) }),
        StynxAuthModule.forRoot({
          tokenVerifier: {
            verifyAuthorizationHeader: async () => ({
              principal: { id: ACTOR, roles: ['member'], permissions: [], tenants: [TENANT], claims: { tenant_id: TENANT } },
            }),
          },
        }),
      ],
      controllers: [CommandController],
    }).compile();
    const app = testing.createNestApplication();
    try {
      await app.init();
      const server = app.getHttpServer();
      await request(server).post('/command-absent-module/legacy').set('authorization', 'Bearer verified')
        .expect(201).expect({ id: 'legacy' });
      const response = await request(server).post('/command-absent-module/marked')
        .set('authorization', 'Bearer verified').set('idempotency-key', 'marked-key');
      expectModuleRequiredEnvelope(response);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('emits the same module-required envelope with neither core, an auth guard nor StynxAuthModule', async () => {
    const command = (backend as unknown as { TransactionalCommand?: () => MethodDecorator }).TransactionalCommand;
    const handler = vi.fn(() => ({ id: 'must-not-run' }));
    @Controller('/command-absent-module-no-core')
    class NoCoreController {
      @Post('/marked')
      marked() { return handler(); }
    }
    command!()(NoCoreController.prototype, 'marked', Object.getOwnPropertyDescriptor(NoCoreController.prototype, 'marked')!);
    const testing = await Test.createTestingModule({ controllers: [NoCoreController] }).compile();
    const app = testing.createNestApplication();
    try {
      await app.init();
      const response = await request(app.getHttpServer()).post('/command-absent-module-no-core/marked')
        .set('idempotency-key', 'marked-key').set('x-request-id', 'invalid-request-id');
      expectModuleRequiredEnvelope(response);
      expect(handler).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
