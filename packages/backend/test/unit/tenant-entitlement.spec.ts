import { ClaimFirstTenantEntitlementPolicy } from '../../src/auth/claim-first-tenant-entitlement.policy';
import { SqlTenantEntitlementFallback } from '../../src/auth/sql-tenant-entitlement.fallback';

function mkContext(claims: Record<string, unknown>, tenantId = 't-1') {
  return {
    tenantId,
    principal: {
      id: 'p-1',
      roles: [],
      permissions: [],
      tenants: [],
      claims: { sub: 'p-1', ...claims },
      email: 'a@b.test',
    },
  } as never;
}

describe('ClaimFirstTenantEntitlementPolicy', () => {
  it('grants when a string claim contains the tenantId', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ 'custom:tenant_id': 't-1' }))).resolves.toBe(true);
  });

  it('grants when an array claim contains the tenantId', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ tenants: ['t-x', 't-1'] }))).resolves.toBe(true);
  });

  it('grants via JSON-array string claim', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(
      policy.isEntitled(mkContext({ 'custom:tenant_ids': '["t-1","t-2"]' })),
    ).resolves.toBe(true);
  });

  it('grants via CSV string claim', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ tenant_ids: 't-x,t-1,t-y' }))).resolves.toBe(true);
  });

  it('denies when a tenant claim is present but does not include the tenantId', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ 'custom:tenant_id': 't-other' }))).resolves.toBe(false);
  });

  it('denies when no tenant claim exists and no fallback configured', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({}))).resolves.toBe(false);
  });

  it('delegates to fallback when no tenant claim and fallback configured', async () => {
    const fallback = { isEntitled: jest.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });
    await expect(policy.isEntitled(mkContext({}))).resolves.toBe(true);
    expect(fallback.isEntitled).toHaveBeenCalled();
  });

  it('does NOT delegate to fallback when a tenant claim exists but excludes the tenantId', async () => {
    const fallback = { isEntitled: jest.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });
    await expect(policy.isEntitled(mkContext({ tenant_id: 't-other' }))).resolves.toBe(false);
    expect(fallback.isEntitled).not.toHaveBeenCalled();
  });

  it('falls back through invalid JSON to CSV parsing', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ tenant_ids: '[not-json' }))).resolves.toBe(false);
    await expect(policy.isEntitled(mkContext({ tenant_ids: 't-1' }))).resolves.toBe(true);
  });

  it('ignores non-string entries in array claims', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(
      policy.isEntitled(mkContext({ tenants: [42 as unknown as string, 't-1'] })),
    ).resolves.toBe(true);
  });

  it('honors custom claimKeys list', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy({ claimKeys: ['my:tenant'] });
    await expect(policy.isEntitled(mkContext({ my: { tenant: 't-1' } } as never))).resolves.toBe(
      false,
    );
    await expect(policy.isEntitled(mkContext({ 'my:tenant': 't-1' }))).resolves.toBe(true);
  });
});

describe('SqlTenantEntitlementFallback', () => {
  function makeExecutor(rows: unknown[]) {
    return { query: jest.fn(async () => ({ rows })) };
  }

  it('returns true when a row matches subject + tenant', async () => {
    const executor = makeExecutor([{ one: 1 }]);
    const fb = new SqlTenantEntitlementFallback({ executor });
    await expect(fb.isEntitled(mkContext({}))).resolves.toBe(true);
    expect(executor.query).toHaveBeenCalled();
  });

  it('returns false when no rows match', async () => {
    const executor = makeExecutor([]);
    const fb = new SqlTenantEntitlementFallback({ executor });
    await expect(fb.isEntitled(mkContext({}))).resolves.toBe(false);
  });

  it('returns false when both subject and email are missing', async () => {
    const executor = makeExecutor([{ one: 1 }]);
    const fb = new SqlTenantEntitlementFallback({ executor });
    const context = mkContext({});
    context.principal.id = '';
    context.principal.email = '';
    context.principal.claims = {};
    await expect(fb.isEntitled(context)).resolves.toBe(false);
    expect(executor.query).not.toHaveBeenCalled();
  });

  it('omits active predicate when activeColumn is null', async () => {
    const executor = makeExecutor([{ one: 1 }]);
    const fb = new SqlTenantEntitlementFallback({ executor, activeColumn: null });
    await fb.isEntitled(mkContext({}));
    const sql = executor.query.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain('is_active');
  });

  it('rejects table identifiers that fail the SQL identifier pattern', () => {
    expect(
      () =>
        new SqlTenantEntitlementFallback({
          executor: makeExecutor([]),
          table: '"; drop table users;--',
        }),
    ).toThrow(/Invalid SQL identifier/);
  });

  it('handles array-form query result (no .rows wrapper)', async () => {
    const executor = { query: jest.fn(async () => [{ one: 1 }]) };
    const fb = new SqlTenantEntitlementFallback({ executor: executor as never });
    await expect(fb.isEntitled(mkContext({}))).resolves.toBe(true);
  });
});
