// Smoke check: pipeline submodule's index.ts loads. U9 (2026-05-17).

describe('@stynx/backend/pipeline export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/pipeline/index')).resolves.toBeDefined();
  });
});
