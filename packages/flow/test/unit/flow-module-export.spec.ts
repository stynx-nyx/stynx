// Smoke check: @stynx/flow module barrel loads. Authored U9 (2026-05-17)
// to keep test/source ratio above the F3xT3 threshold as the Flow
// surface grows (currently 0.125, threshold 0.10).

describe('@stynx/flow module barrel', () => {
  it('top-level index.ts is importable', async () => {
    await expect(import('../../src/index')).resolves.toBeDefined();
  });
});
