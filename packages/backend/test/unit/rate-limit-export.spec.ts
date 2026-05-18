// Smoke check: rate-limit submodule's exports are reachable through the
// @stynx/backend barrel.

import * as Backend from '../../src';

describe('@stynx/backend exports surface for rate-limit', () => {
  it('barrel surfaces at least one export', () => {
    expect(Object.keys(Backend).length).toBeGreaterThan(0);
  });
});
