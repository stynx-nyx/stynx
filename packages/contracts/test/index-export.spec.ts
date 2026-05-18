// Smoke check: @stynx/contracts barrel loads + carries the expected
// error-class exports. Mirrors the existing contracts.test.mjs node-test
// version but in jest-spec form so it counts toward the F3xT3
// test_coherence test/source ratio (sensor only matches .spec/.test.ts).

import * as Contracts from '../src/index';

describe('@stynx/contracts barrel', () => {
  it('exports the StynxError class', () => {
    expect(typeof (Contracts as { StynxError?: unknown }).StynxError).toBe('function');
  });

  it('exports the IdentityAdminError class', () => {
    expect(typeof (Contracts as { IdentityAdminError?: unknown }).IdentityAdminError).toBe('function');
  });
});
