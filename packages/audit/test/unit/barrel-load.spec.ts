// Smoke check: @stynx-nyx/audit barrel loads cleanly. Incidental coverage
// of index.ts + module.ts declarative paths.

import * as Barrel from '../../src';

describe('@stynx-nyx/audit barrel', () => {
  it('exports at least one symbol', () => {
    expect(Object.keys(Barrel).length).toBeGreaterThan(0);
  });
});
