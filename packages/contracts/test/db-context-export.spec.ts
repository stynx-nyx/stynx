// Smoke check: @stynx/contracts/db-context export loads cleanly. U9.

describe('@stynx/contracts/db-context', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
