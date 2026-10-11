import { Test, type TestingModule } from '@nestjs/testing';
import type { ModuleRef } from '@nestjs/core';
import { StynxCoreModule, SystemContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { z } from 'zod';

let moduleRef: TestingModule;

/** Real caller capability; only the database port is a bounded unit double. */
export async function initializePrivacyTestContext(): Promise<void> {
  moduleRef = await Test.createTestingModule({
    imports: [StynxCoreModule.forRoot({ appName: 'privacy-unit', schema: z.object({}) })],
  }).compile();
  await moduleRef.init();
}

export async function closePrivacyTestContext(): Promise<void> {
  await moduleRef?.close();
}

export function privacyUnitModuleRef(database: unknown): ModuleRef {
  return {
    get: (token: unknown) =>
      token === Database ? database : moduleRef.get(token as never, { strict: false }),
  } as unknown as ModuleRef;
}

export function runPrivacyInternal<T>(job: () => Promise<T>): Promise<T> {
  return moduleRef.get(SystemContext).withSystemContext('explicit privacy unit internal job', job);
}
