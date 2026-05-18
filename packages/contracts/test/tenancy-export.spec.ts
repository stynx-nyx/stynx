// Smoke check: @stynx/contracts/tenancy export loads cleanly. U9.

describe('@stynx/contracts/tenancy', () => {
  it('module is importable from the barrel', async () => {
    const barrel = await import('../src/index');
    expect(barrel).toBeDefined();
  });
});
