import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureSecurityHeaders } from '../../src/security-headers';

@Controller('/security-header-probe')
class SecurityHeaderProbeController {
  @Get()
  probe() {
    return { status: 'ok' };
  }
}

@Module({
  controllers: [SecurityHeaderProbeController],
})
class SecurityHeaderProbeModule {}

async function createProbeApp(isProduction: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [SecurityHeaderProbeModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureSecurityHeaders(app, { isProduction });
  await app.init();
  return app;
}

describe('reference API security headers', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('sets the API security header baseline without local-development HSTS', async () => {
    app = await createProbeApp(false);

    const response = await request(app.getHttpServer())
      .get('/security-header-probe')
      .expect(200);

    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('enables HSTS only for production-like deployments', async () => {
    app = await createProbeApp(true);

    const response = await request(app.getHttpServer())
      .get('/security-header-probe')
      .expect(200);

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });
});
