import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SessionJwksController } from '../../src/jwks.controller';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';

describe('SessionJwksController E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionJwksController],
      providers: [
        {
          provide: SessionJwtSigningService,
          useValue: { getJwks: vi.fn(async () => ({ keys: [{ kid: 'e2e-key' }] })) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes JWKS through the well-known HTTP endpoint', async () => {
    await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200)
      .expect({ keys: [{ kid: 'e2e-key' }] });
  });
});
