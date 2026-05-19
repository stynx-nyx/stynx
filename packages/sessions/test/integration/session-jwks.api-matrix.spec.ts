import { generateKeyPairSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SessionJwtSigningService } from '../../src/jwt-signing.service';
import { SessionJwksController } from '../../src/jwks.controller';
import { STYNX_SESSIONS_OPTIONS } from '../../src/tokens';
import { resolveSessionsOptions } from '../../src/types';

function buildKeySet() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  return {
    currentKid: 'api-matrix-key-1',
    keys: [
      {
        kid: 'api-matrix-key-1',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
    ],
  };
}

describe('SessionJwksController API error matrix', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionJwksController],
      providers: [
        {
          provide: STYNX_SESSIONS_OPTIONS,
          useValue: resolveSessionsOptions({
            issuer: 'https://sessions.example.test',
            redis: { url: 'redis://127.0.0.1:6379' },
            jwt: { keySet: buildKeySet() },
          }),
        },
        SessionJwtSigningService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /.well-known/jwks.json', () => {
    it('returns 200/201 when JWKS signing material is configured', async () => {
      const response = await request(app.getHttpServer())
        .get('/.well-known/jwks.json')
        .expect(200);

      expect(response.body).toEqual({
        keys: [
          expect.objectContaining({
            alg: 'RS256',
            kid: 'api-matrix-key-1',
            kty: 'RSA',
            use: 'sig',
          }),
        ],
      });
      expect(response.body.keys[0]).not.toHaveProperty('d');
      expect(response.body.keys[0]).not.toHaveProperty('privateKeyPem');
    });
  });
});
