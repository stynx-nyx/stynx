// Smoke check: storage submodule's index.ts loads. U9 (2026-05-17).

describe('@stynx/backend/storage export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/storage/index')).resolves.toBeDefined();
  });
});
