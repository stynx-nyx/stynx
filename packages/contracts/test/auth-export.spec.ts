// Smoke check: @stynx/contracts/auth export loads cleanly. U9.

describe('@stynx/contracts/auth', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
