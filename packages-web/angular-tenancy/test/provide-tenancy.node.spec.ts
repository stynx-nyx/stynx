/**
 * @vitest-environment node
 */
import '@angular/compiler';
import { type Provider } from '@angular/core';
import { provideTenancy } from '../src/provide-tenancy';
import { STYNX_TENANCY_WINDOW } from '../src/tokens';

describe('provideTenancy SSR window provider', () => {
  it('returns null when no browser window is available', () => {
    const providers = provideTenancy() as Array<Provider | Record<string, unknown>>;
    const windowProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === STYNX_TENANCY_WINDOW,
    ) as Record<string, () => Window | null>;

    expect(windowProvider['useFactory']()).toBeNull();
  });
});
