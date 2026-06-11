import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureSecurityHeaders } from './security-headers';

function resolveCorsOrigins(): string[] {
  return (process.env.STYNX_REFERENCE_WEB_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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
    exposedHeaders: [
      'X-Request-Id',
      'X-Stynx-Auth-Verify-Ms',
    ],
  });
  const port = Number(process.env.PORT ?? '3000');
  await app.listen(port);
  Logger.log(`reference-api listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, 'Bootstrap');
  process.exitCode = 1;
});
