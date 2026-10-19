import type { INestApplication } from '@nestjs/common';
import { configureSecurityHeaders } from '../security-headers.js';
import type { ReferenceApplicationOptions } from '../bootstrap.js';

/** Apply the real reference HTTP middleware; this does not initialize or listen. */
export function configurePerformanceApplication(
  app: INestApplication,
  options: ReferenceApplicationOptions,
): INestApplication {
  options.onNestCreated?.(app);
  configureSecurityHeaders(app);
  app.enableCors({
    origin: (
      process.env.STYNX_REFERENCE_WEB_ORIGINS ?? 'http://127.0.0.1:3100,http://localhost:3100'
    )
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
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
