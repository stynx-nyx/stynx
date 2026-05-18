// Smoke check: @stynx/audit barrel loads cleanly. Incidental coverage
// of index.ts + module.ts declarative paths.

import * as Barrel from '../../src';

describe('@stynx/audit barrel', () => {
  it('exports at least one symbol', () => {
    expect(Object.keys(Barrel).length).toBeGreaterThan(0);
  });
});
