// Smoke check: @stynx/contracts/errors export loads cleanly. U9.

describe('@stynx/contracts/errors', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
