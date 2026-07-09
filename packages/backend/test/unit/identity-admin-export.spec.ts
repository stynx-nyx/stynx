// Smoke check: identity-admin submodule's exports are reachable through the
// @stynx-nyx/backend barrel.

import * as Backend from '../../src';

describe('@stynx-nyx/backend exports surface for identity-admin', () => {
  it('barrel surfaces at least one export', () => {
    expect(Object.keys(Backend).length).toBeGreaterThan(0);
  });
});
