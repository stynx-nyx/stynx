import type { INestApplication } from '@nestjs/common';

export interface ReferenceApplicationOptions {
  onNestCreated?: (app: INestApplication) => void;
}

function resolveCorsOrigins(): string[] {
  return (process.env.STYNX_REFERENCE_WEB_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export async function createReferenceApplication(
  options: ReferenceApplicationOptions = {},
): Promise<INestApplication> {
  const [{ NestFactory }, { AppModule }, { configureSecurityHeaders }] = await Promise.all([
    import('@nestjs/core'),
    import('./app.module.js'),
    import('./security-headers.js'),
  ]);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  options.onNestCreated?.(app);
  configureSecurityHeaders(app);
  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
      'X-Tenant-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'X-Stynx-Auth-Verify-Ms'],
  });
  return app;
}
