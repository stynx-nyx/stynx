import type { INestApplication } from '@nestjs/common';
import type { ReferenceApplicationOptions } from '../bootstrap.js';

/** Explicit mounted root; production guards and reference infrastructure remain active. */
export async function createReferenceApplication(
  options: ReferenceApplicationOptions = {},
): Promise<INestApplication> {
  const [{ NestFactory }, { OfflineCTG9ApplicationModule }, { configurePerformanceApplication }] =
    await Promise.all([
      import('@nestjs/core'),
      import('./offline-ctg9.module.js'),
      import('./configure.js'),
    ]);
  const app = await NestFactory.create(OfflineCTG9ApplicationModule, { bufferLogs: true });
  return configurePerformanceApplication(app, options);
}
