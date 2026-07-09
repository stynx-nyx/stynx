import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import { StynxJwtValidator } from '@stynx-nyx/auth';
import request from 'supertest';
import { z } from 'zod';
import { ReferenceDevAuthController } from '../../src/sample/reference-dev-auth.controller';
import { ReferenceDevAuthService } from '../../src/sample/reference-dev-auth.service';

const demoTenantId = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
const validRequestId = '01978f4a-32bf-7c27-a131-fd73a9e004a1';

const demoTenants = [
  {
    id: demoTenantId,
    slug: 'sample-demo',
    name: 'Sample Demo Tenant',
  },
  {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a2',
    slug: 'sample-ops',
    name: 'Sample Ops Tenant',
  },
];

describe('ReferenceDevAuthController API error matrix', () => {
  let app: INestApplication;
  const referenceDevAuth = {
    listDemoTenants: vi.fn(() => demoTenants),
    login: vi.fn(async (input: { email?: string; tenantId?: string; tenantSlug?: string }) => {
      const email = (input.email ?? 'admin@sample-demo.test').trim().toLowerCase();
      if (email.length === 0) {
        throw new UnauthorizedException('Email is required');
      }
      return {
        accessToken: 'valid-stynx-token',
        refreshToken: 'refresh-token',
        sid: 'session-1',
        expiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
        tenantId: input.tenantId ?? demoTenantId,
        email,
        permissions: ['sample:record:read'],
      };
    }),
  };
  const stynxJwtValidator = {
    validate: vi.fn(async (token: string) => {
      if (token !== 'valid-stynx-token') {
        throw new UnauthorizedException('Invalid STYNX bearer token');
      }
      return {
        sub: 'user-1',
        sid: 'session-1',
        tenantId: demoTenantId,
        claims: {},
      };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({
          appName: 'reference-dev-auth-api-matrix',
          schema: z.object({}).passthrough(),
          ssm: { enabled: false },
        }),
      ],
      controllers: [ReferenceDevAuthController],
      providers: [
        {
          provide: ReferenceDevAuthService,
          useValue: referenceDevAuth,
        },
        {
          provide: StynxJwtValidator,
          useValue: stynxJwtValidator,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /_reference/demo-tenants', () => {
    it('returns 200 with the public demo tenant inventory', async () => {
      await request(app.getHttpServer())
        .get('/_reference/demo-tenants')
        .set('X-Request-Id', validRequestId)
        .expect(200)
        .expect(({ body, headers }) => {
          expect(headers['x-request-id']).toBe(validRequestId);
          expect(body).toEqual(demoTenants);
        });

      expect(referenceDevAuth.listDemoTenants).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when X-Request-Id is malformed', async () => {
      await request(app.getHttpServer())
        .get('/_reference/demo-tenants')
        .set('X-Request-Id', 'not-a-uuidv7')
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('X-Request-Id must be a valid UUIDv7');
        });
    });
  });

  describe('POST /_reference/dev-login', () => {
    it('returns 201 with a STYNX session bundle for a valid dev-login request', async () => {
      await request(app.getHttpServer())
        .post('/_reference/dev-login')
        .send({
          email: 'ADMIN@SAMPLE-DEMO.TEST',
          tenantSlug: 'sample-demo',
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            accessToken: 'valid-stynx-token',
            tenantId: demoTenantId,
            email: 'admin@sample-demo.test',
            permissions: ['sample:record:read'],
          });
        });

      expect(referenceDevAuth.login).toHaveBeenCalledWith({
        email: 'ADMIN@SAMPLE-DEMO.TEST',
        tenantSlug: 'sample-demo',
      });
    });

    it('returns 400 for malformed JSON', async () => {
      await request(app.getHttpServer())
        .post('/_reference/dev-login')
        .set('content-type', 'application/json')
        .send('{"email":')
        .expect(400);
    });

    it('returns 401 when the email is blank', async () => {
      await request(app.getHttpServer())
        .post('/_reference/dev-login')
        .send({
          email: '   ',
          tenantSlug: 'sample-demo',
        })
        .expect(401)
        .expect(({ body }) => {
          expect(body.message).toBe('Email is required');
        });
    });
  });

  describe('GET /_reference/auth-verify', () => {
    it('returns 200 and auth timing for a valid STYNX bearer token', async () => {
      await request(app.getHttpServer())
        .get('/_reference/auth-verify')
        .set('Authorization', 'Bearer valid-stynx-token')
        .expect(200)
        .expect(({ body, headers }) => {
          expect(body).toEqual({ status: 'ok' });
          expect(headers['x-stynx-auth-verify-ms']).toEqual(expect.any(String));
        });

      expect(stynxJwtValidator.validate).toHaveBeenCalledWith('valid-stynx-token');
    });

    it('returns 400 when the STYNX bearer token is missing', async () => {
      await request(app.getHttpServer())
        .get('/_reference/auth-verify')
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toBe('Missing STYNX bearer token');
        });
    });
  });
});
