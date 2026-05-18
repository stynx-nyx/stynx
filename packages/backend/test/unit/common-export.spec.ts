// Smoke check: common submodule's index.ts loads. U9 (2026-05-17).

describe('@stynx/backend/common export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/common/index')).resolves.toBeDefined();
  });
});
