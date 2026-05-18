// Smoke check: @stynx/contracts/storage export loads cleanly. U9.

describe('@stynx/contracts/storage', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
