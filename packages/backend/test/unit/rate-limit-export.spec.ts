// Smoke check: rate-limit submodule's index.ts loads. U9 (2026-05-17).

describe('@stynx/backend/rate-limit export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/rate-limit/index')).resolves.toBeDefined();
  });
});
