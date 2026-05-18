// Smoke check: @stynx/i18n barrel loads. Authored U9 (2026-05-17) to lift
// packages/i18n test/source ratio above the F3xT3 threshold.

describe('@stynx/i18n barrel', () => {
  it('top-level index.ts is importable', async () => {
    await expect(import('../../src/index')).resolves.toBeDefined();
  });
});
