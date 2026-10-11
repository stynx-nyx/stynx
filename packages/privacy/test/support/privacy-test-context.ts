import { PrivacyHttpContextMiddleware } from '../../src/privacy-context';
import { Test, type TestingModule } from '@nestjs/testing';
import type { ModuleRef } from '@nestjs/core';
import { StynxCoreModule, SystemContext, RequestContextMutator } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { z } from 'zod';

let moduleRef: TestingModule;

/** Real caller capability; only the database port is a bounded unit double. */
export async function initializePrivacyTestContext(): Promise<void> {
  moduleRef = await Test.createTestingModule({
    imports: [
      StynxCoreModule.forRoot({
        appName: 'privacy-unit',
        schema: z.object({}),
      }),
    ],
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

/** Negative unit frame: real HTTP origin/CLS, deliberately no verified tenancy port. */
export function runPrivacyUnadmittedUnitRequest<T>(job: () => T): T {
  let result!: T;
  new PrivacyHttpContextMiddleware().use({}, {}, () => {
    result = moduleRef.get(RequestContextMutator).runWithRequestContext(
      {
        requestId: 'privacy-missing-admission-port',
        tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
        actorId: '0197481e-7294-7c53-8b03-5c36d7c2831a',
        startedAt: new Date(),
      },
      job,
    ) as T;
  });
  return result;
}
