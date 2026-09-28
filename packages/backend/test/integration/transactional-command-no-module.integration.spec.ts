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
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
