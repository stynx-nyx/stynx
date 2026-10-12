import type { INestApplication } from '@nestjs/common';
import type { ReferenceApplicationOptions } from '../bootstrap';

/** Explicit mounted root; production guards and reference infrastructure remain active. */
export async function createReferenceApplication(
  options: ReferenceApplicationOptions = {},
): Promise<INestApplication> {
  const [{ NestFactory }, { DomainApplicationModule }, { configurePerformanceApplication }] =
    await Promise.all([
      import('@nestjs/core'),
      import('./domain.module.js'),
      import('./configure.js'),
    ]);
  const app = await NestFactory.create(DomainApplicationModule, { bufferLogs: true });
  return configurePerformanceApplication(app, options);
}
