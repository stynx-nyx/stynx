import type { INestApplication } from '@nestjs/common';
import type { ReferenceApplicationOptions } from '../bootstrap';

/** Explicit mounted root; production guards and reference infrastructure remain active. */
export async function createReferenceApplication(
  options: ReferenceApplicationOptions = {},
): Promise<INestApplication> {
  const [{ NestFactory }, { I18nApplicationModule }, { configurePerformanceApplication }] =
    await Promise.all([
      import('@nestjs/core'),
      import('./i18n.module.js'),
      import('./configure.js'),
    ]);
  const app = await NestFactory.create(I18nApplicationModule, { bufferLogs: true });
  return configurePerformanceApplication(app, options);
}
