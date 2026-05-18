// Smoke check: @stynx/contracts/identity-admin export loads cleanly. U9.

describe('@stynx/contracts/identity-admin', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
