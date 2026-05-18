// Smoke check: sla submodule's exports are reachable through the
// @stynx/backend barrel.

import * as Backend from '../../src';

describe('@stynx/backend exports surface for sla', () => {
  it('barrel surfaces at least one export', () => {
    expect(Object.keys(Backend).length).toBeGreaterThan(0);
  });
});
