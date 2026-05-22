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
    const fallback = { isEntitled: vi.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });
    const context = mkContext({});
    await expect(policy.isEntitled(context)).resolves.toBe(true);
    expect(fallback.isEntitled).toHaveBeenCalledWith(context);
  });

  it('does NOT delegate to fallback when a tenant claim exists but excludes the tenantId', async () => {
    const fallback = { isEntitled: vi.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });
    await expect(policy.isEntitled(mkContext({ tenant_id: 't-other' }))).resolves.toBe(false);
    expect(fallback.isEntitled).not.toHaveBeenCalled();
  });

  it('falls back through invalid JSON to CSV parsing', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ tenant_ids: '[not-json' }))).resolves.toBe(false);
    await expect(policy.isEntitled(mkContext({ tenant_ids: '[not-json]' }))).resolves.toBe(false);
    await expect(policy.isEntitled(mkContext({ tenant_ids: 't-1' }))).resolves.toBe(true);
  });

  it('ignores non-string and blank string claims', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(policy.isEntitled(mkContext({ tenants: 123 }))).resolves.toBe(false);
    await expect(policy.isEntitled(mkContext({ tenants: '   ' }))).resolves.toBe(false);
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
    return { query: vi.fn(async () => ({ rows })) };
  }

  it('returns true when a row matches subject + tenant', async () => {
    const executor = makeExecutor([{ one: 1 }]);
    const fb = new SqlTenantEntitlementFallback({ executor });
    await expect(fb.isEntitled(mkContext({}))).resolves.toBe(true);
    expect(executor.query).toHaveBeenCalledWith(
      expect.stringContaining('from auth.users'),
      ['t-1', 'p-1', 'a@b.test'],
    );
    expect(executor.query.mock.calls[0]?.[0]).toContain('where tenant_id = $1');
    expect(executor.query.mock.calls[0]?.[0]).toContain('and is_active = true');
    expect(executor.query.mock.calls[0]?.[0]).toContain('(oidc_sub is not distinct from $2)');
    expect(executor.query.mock.calls[0]?.[0]).toContain('or (email is not distinct from $3)');
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
    expect(executor.query).toHaveBeenCalledWith(expect.stringContaining('from auth.users'), [
      't-1',
      'p-1',
      'a@b.test',
    ]);
  });

  it('rejects table identifiers that fail the SQL identifier pattern', () => {
    for (const table of ['"; drop table users;--', 'auth.bad-name', 'auth.123users']) {
      expect(
        () =>
          new SqlTenantEntitlementFallback({
            executor: makeExecutor([]),
            table,
          }),
      ).toThrow(new RegExp(`Invalid SQL identifier for table: ${table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
    }
  });

  it('handles array-form query result (no .rows wrapper)', async () => {
    const executor = { query: vi.fn(async () => [{ one: 1 }]) };
    const fb = new SqlTenantEntitlementFallback({ executor: executor as never });
    await expect(fb.isEntitled(mkContext({}))).resolves.toBe(true);
  });

  it('uses custom identifiers and trims fallback subject and email parameters exactly', async () => {
    const executor = makeExecutor([]);
    const fb = new SqlTenantEntitlementFallback({
      executor,
      table: 'security.memberships',
      tenantColumn: 'tenant_uuid',
      subjectColumn: 'subject_ref',
      emailColumn: 'email_ref',
      activeColumn: 'enabled',
    });
    const context = mkContext({
      sub: '   ',
      email: ' claim-email@example.test ',
    }, 'tenant-custom');
    context.principal.id = ' principal-id ';
    context.principal.email = '   ';

    await expect(fb.isEntitled(context)).resolves.toBe(false);

    const sql = executor.query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('from security.memberships');
    expect(sql).toContain('where tenant_uuid = $1');
    expect(sql).toContain('and enabled = true');
    expect(sql).toContain('(subject_ref is not distinct from $2)');
    expect(sql).toContain('or (email_ref is not distinct from $3)');
    expect(executor.query).toHaveBeenCalledWith(expect.any(String), [
      'tenant-custom',
      'principal-id',
      'claim-email@example.test',
    ]);
  });

  it('returns false without querying when subject and email normalize to empty values', async () => {
    const executor = makeExecutor([{ one: 1 }]);
    const fb = new SqlTenantEntitlementFallback({ executor });
    const context = mkContext({ sub: ' ', email: ' ' });
    context.principal.id = ' ';
    context.principal.email = ' ';

    await expect(fb.isEntitled(context)).resolves.toBe(false);

    expect(executor.query).not.toHaveBeenCalled();
  });
});
