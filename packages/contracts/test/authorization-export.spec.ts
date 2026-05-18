// Smoke check: @stynx/contracts/authorization export loads cleanly. U9.

describe('@stynx/contracts/authorization', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
