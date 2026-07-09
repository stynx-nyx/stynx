// Smoke check: @stynx-nyx/sessions barrel loads cleanly. Incidental coverage
// of index.ts + module.ts declarative paths.

import * as Barrel from '../../src';

describe('@stynx-nyx/sessions barrel', () => {
  it('exports at least one symbol', () => {
    expect(Object.keys(Barrel).length).toBeGreaterThan(0);
  });
});
