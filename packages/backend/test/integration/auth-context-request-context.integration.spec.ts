import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestContext, StynxCoreModule } from '@stynx-nyx/core';
import request from 'supertest';
import { z } from 'zod';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';

@Controller('/auth-context-only')
@UseGuards(AuthContextGuard)
class AuthContextOnlyController {
  constructor(private readonly context: RequestContext) {}

  @Get('/verified')
  verified() {
    return { actorId: this.context.actorId, tenantId: this.context.tenantId, sessionId: this.context.sessionId };
  }
}

@Module({
  imports: [StynxAuthModule.forRoot({
    tokenVerifier: {
      verifyAuthorizationHeader: async () => ({
        principal: { id: ACTOR, roles: ['member'], permissions: ['records:read'], tenants: [TENANT], claims: { sid: 'verified-session' } },
      }),
    },
  })],
  controllers: [AuthContextOnlyController],
})
class AuthContextOnlyModule {}

describe('AuthContextGuard-only request context HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testing = await Test.createTestingModule({
      imports: [StynxCoreModule.forRoot({ appName: 'auth-context-only', schema: z.object({}) }), AuthContextOnlyModule],
    }).compile();
    app = testing.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('patches verified actor, tenant, and session into RequestContext without tenancy', async () => {
    await request(app.getHttpServer()).get('/auth-context-only/verified').set('authorization', 'Bearer verified')
      .expect(200).expect({ actorId: ACTOR, tenantId: TENANT, sessionId: 'verified-session' });
  });
});
