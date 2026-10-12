import { expect } from 'vitest';
import { PreferencesController } from '../../src/preferences.controller';
import { PreferencesError } from '../../src/errors';
import { InMemoryPreferencesStore } from '../../src/in-memory-preferences.store';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../../src/schema';
import { PreferencesService } from '../../src/preferences.service';
import type { PreferenceValues, PreferencesAuditEvent } from '../../src/types';

export const tenantA = '00000000-0000-4000-8000-000000000001';
export const tenantB = '00000000-0000-4000-8000-000000000002';

export function harness(tenantId = tenantA, subjectId = 'external|subject-1') {
  const context = { tenantId, actorId: subjectId, requestId: 'request-1' };
  const store = new InMemoryPreferencesStore();
  const events: PreferencesAuditEvent[] = [];
  const service = new PreferencesService(
    { get: () => context } as never,
    store,
    {},
    { write: (event) => events.push(event) },
    { resolve: async (id) => (id ? `signed:${id}` : null) },
  );
  return { context, store, events, service, controller: new PreferencesController(service) };
}

export const changed: PreferenceValues = {
  ...structuredClone(PLATFORM_PREFERENCE_DEFAULTS),
  locale: { locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
  theme: { colorScheme: 'dark', contrast: 'more', density: 'compact' },
};

export function errorCode(error: unknown): string | undefined {
  return error instanceof PreferencesError ? error.code : undefined;
}

export async function preferencesError(operation: Promise<unknown>): Promise<PreferencesError> {
  let captured: unknown;
  try {
    await operation;
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(PreferencesError);
  return captured as PreferencesError;
}
