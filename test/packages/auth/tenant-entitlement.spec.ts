import { ClaimFirstTenantEntitlementPolicy } from '../../../packages/backend/src/auth/claim-first-tenant-entitlement.policy';
import { SqlTenantEntitlementFallback } from '../../../packages/backend/src/auth/sql-tenant-entitlement.fallback';

const principalBase = {
  id: 'user-1',
  roles: ['admin'],
  permissions: [],
  tenants: [],
  claims: {},
  email: 'user@example.com',
};

describe('ClaimFirstTenantEntitlementPolicy', () => {
  it('accepts when tenant appears in claim list', async () => {
    const policy = new ClaimFirstTenantEntitlementPolicy();
    await expect(
      policy.isEntitled({
        principal: {
          ...principalBase,
          claims: {
            tenant_ids: 'tenant-a,tenant-b',
          },
        },
        tenantId: 'tenant-b',
      }),
    ).resolves.toBe(true);
  });

  it('rejects when claim list exists but tenant is absent', async () => {
    const fallback = { isEntitled: jest.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });

    await expect(
      policy.isEntitled({
        principal: {
          ...principalBase,
          claims: {
            tenant_ids: ['tenant-a'],
          },
        },
        tenantId: 'tenant-x',
      }),
    ).resolves.toBe(false);
    expect(fallback.isEntitled).not.toHaveBeenCalled();
  });

  it('uses fallback only when no tenant claims are present', async () => {
    const fallback = { isEntitled: jest.fn(async () => true) };
    const policy = new ClaimFirstTenantEntitlementPolicy({ fallback });

    await expect(
      policy.isEntitled({
        principal: {
          ...principalBase,
          claims: { sub: 'user-1' },
        },
        tenantId: 'tenant-a',
      }),
    ).resolves.toBe(true);
    expect(fallback.isEntitled).toHaveBeenCalledTimes(1);
  });
});

describe('SqlTenantEntitlementFallback', () => {
  it('queries executor and returns true when membership row exists', async () => {
    const query = jest.fn(
      async (_sql: string, _params?: ReadonlyArray<unknown>) => ({ rows: [{ one: 1 }] }),
    );
    const fallback = new SqlTenantEntitlementFallback({
      executor: { query: query as never },
      table: 'auth.users',
      tenantColumn: 'tenant_id',
      subjectColumn: 'oidc_sub',
      emailColumn: 'email',
      activeColumn: 'is_active',
    });

    await expect(
      fallback.isEntitled({
        principal: {
          ...principalBase,
          claims: { sub: 'sub-1', email: 'user@example.com' },
        },
        tenantId: 'tenant-a',
      }),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const firstCall = query.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Missing query call');
    }
    const sql = firstCall[0];
    const params = firstCall[1];
    expect(sql).toContain('from auth.users');
    expect(sql).toContain('is_active = true');
    expect(params).toEqual(['tenant-a', 'sub-1', 'user@example.com']);
  });

  it('returns false when no subject/email is available', async () => {
    const query = jest.fn(
      async (_sql: string, _params?: ReadonlyArray<unknown>) => ({ rows: [{ one: 1 }] }),
    );
    const fallback = new SqlTenantEntitlementFallback({
      executor: { query: query as never },
    });

    await expect(
      fallback.isEntitled({
        principal: {
          ...principalBase,
          id: '',
          email: undefined,
          claims: {},
        },
        tenantId: 'tenant-a',
      }),
    ).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
