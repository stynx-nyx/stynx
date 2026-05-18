// Smoke check: sla submodule's index.ts loads. U9 (2026-05-17).

describe('@stynx/backend/sla export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/sla/index')).resolves.toBeDefined();
  });
});
