/**
 * @vitest-environment node
 */
import '@angular/compiler';
import { type Provider } from '@angular/core';
import { provideTenancy } from '../src/provide-tenancy';
import { STYNX_TENANCY_WINDOW } from '../src/tokens';

type ProviderRecord = Provider & Record<string, unknown> & {
  provide: unknown;
};

function isProviderRecord(provider: Provider): provider is ProviderRecord {
  return typeof provider === 'object' && provider !== null && !Array.isArray(provider) && 'provide' in provider;
}

function findProvider(providers: Provider[], token: unknown): ProviderRecord {
  const provider = providers.find((candidate): candidate is ProviderRecord =>
    isProviderRecord(candidate) && candidate.provide === token,
  );
  if (!provider) {
    throw new Error(`Expected provider for ${String(token)}`);
  }
  return provider;
}

function providerFactory<TResult>(provider: ProviderRecord): () => TResult {
  expect(provider.useFactory).toEqual(expect.any(Function));
  return provider.useFactory as () => TResult;
}

describe('provideTenancy SSR window provider', () => {
  it('returns null when no browser window is available', () => {
    const providers = provideTenancy();
    const windowProvider = findProvider(providers, STYNX_TENANCY_WINDOW);

    expect(providerFactory<Window | null>(windowProvider)()).toBe(null);
  });
});
