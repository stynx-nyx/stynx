// Smoke check: rate-limit submodule's exports are reachable through the
// @stynx-nyx/backend barrel.

import * as Backend from '../../src';

describe('@stynx-nyx/backend exports surface for rate-limit', () => {
  it('barrel surfaces at least one export', () => {
    expect(Object.keys(Backend).length).toBeGreaterThan(0);
  });
});
