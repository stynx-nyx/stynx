import type { INestApplication } from '@nestjs/common';
import type { ReferenceApplicationOptions } from '../bootstrap.js';

/** Explicit mounted root; production guards and reference infrastructure remain active. */
export async function createReferenceApplication(
  options: ReferenceApplicationOptions = {},
): Promise<INestApplication> {
  const [{ NestFactory }, { PrivacyApplicationModule }, { configurePerformanceApplication }] =
    await Promise.all([
      import('@nestjs/core'),
      import('./privacy.module.js'),
      import('./configure.js'),
    ]);
  const app = await NestFactory.create(PrivacyApplicationModule, { bufferLogs: true });
  return configurePerformanceApplication(app, options);
}
