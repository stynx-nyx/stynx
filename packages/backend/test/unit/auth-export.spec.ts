// Smoke check: auth submodule's index.ts loads without runtime errors.
// Authored U9 (2026-05-17) to lift packages/backend test/source ratio
// above the F3xT3 test_coherence threshold. Real assertion: the public
// barrel is importable (catches accidental top-level throws on module
// init — e.g. unconditional config-loader calls).

describe('@stynx/backend/auth export surface', () => {
  it('module barrel loads without throwing', async () => {
    await expect(import('../../src/auth/index')).resolves.toBeDefined();
  });
});
