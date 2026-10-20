import type { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { PermissionQueryService } from '../../src/permission-query.service.js';
import { StynxSessionClaimsResolver } from '../../src/session-claims-resolver.js';

// INV-RBAC-001 / S-12 (SM-14): authorization is resolved when a token is minted and
// carried in its verified claims; nothing here runs on the request path.

describe('PermissionQueryService.resolveRolesForUser', () => {
  it('returns the distinct, sorted role keys of the active membership in the tenant', async () => {
    const trx = {
      query: vi.fn().mockResolvedValue({
        rows: [{ key: 'writer' }, { key: 'admin' }, { key: 'writer' }],
      }),
    };
    const database = { tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)) };
    const moduleRef = {
      get: vi.fn((token: unknown) => (token === Database ? database : undefined)),
    } as unknown as ModuleRef;

    await expect(
      new PermissionQueryService(moduleRef).resolveRolesForUser('user-1', 'tenant-1'),
    ).resolves.toEqual(['admin', 'writer']);
    const [sql, params] = trx.query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['user-1', 'tenant-1']);
    expect(sql).toContain('is_active = true');
    expect(sql).toContain('auth.membership_roles');
    expect(sql).toContain('auth.group_roles');
  });
});

describe('StynxSessionClaimsResolver', () => {
  const subject = {
    sid: 'sid-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    expiresAt: '2026-10-20T00:00:00.000Z',
  };

  function queries(overrides: Partial<Record<'resolveForUser' | 'resolveRolesForUser', unknown>> = {}) {
    return {
      resolveForUser: vi.fn(async () => ({
        membershipId: 'membership-1',
        permissions: ['records:read', 'records:write'],
        hash: 'hash-1',
        generation: 3,
      })),
      resolveRolesForUser: vi.fn(async () => ['editor']),
      ...overrides,
    } as unknown as PermissionQueryService & {
      resolveForUser: ReturnType<typeof vi.fn>;
      resolveRolesForUser: ReturnType<typeof vi.fn>;
    };
  }

  it('resolves permissions, roles and hash for the token, and primes the inspection cache', async () => {
    const prime = vi.fn(async () => undefined);
    const resolver = new StynxSessionClaimsResolver(queries(), { prime } as never);

    await expect(resolver.resolve(subject)).resolves.toEqual({
      permissions: ['records:read', 'records:write'],
      roles: ['editor'],
      permsHash: 'hash-1',
    });
    expect(prime).toHaveBeenCalledWith(
      expect.objectContaining({
        sid: 'sid-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        permissions: ['records:read', 'records:write'],
        hash: 'hash-1',
        generation: 3,
      }),
      '2026-10-20T00:00:00.000Z',
    );
  });

  it('still issues claims when the informational cache cannot be primed, or is absent', async () => {
    const failing = new StynxSessionClaimsResolver(queries(), {
      prime: vi.fn(async () => {
        throw new Error('redis down');
      }),
    } as never);
    await expect(failing.resolve(subject)).resolves.toMatchObject({ roles: ['editor'] });
    await expect(new StynxSessionClaimsResolver(queries()).resolve(subject)).resolves.toMatchObject({
      permsHash: 'hash-1',
    });
  });

  it('refuses to mint for a subject without access to the tenant', async () => {
    const denied = queries({
      resolveForUser: vi.fn(async () => {
        throw new Error('TENANT_ACCESS_DENIED');
      }),
    });
    const prime = vi.fn();
    await expect(
      new StynxSessionClaimsResolver(denied, { prime } as never).resolve(subject),
    ).rejects.toThrow('TENANT_ACCESS_DENIED');
    expect(denied.resolveRolesForUser).not.toHaveBeenCalled();
    expect(prime).not.toHaveBeenCalled();
  });
});
