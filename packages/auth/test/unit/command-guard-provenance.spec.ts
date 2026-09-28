import type { ExecutionContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import * as contracts from '@stynx-nyx/contracts';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';

// INV-RBAC-001: the command bootstrap trusts only an own brand on a built-in guard constructor.
function guard() {
  const moduleRef = { get: vi.fn(() => undefined) } as unknown as ModuleRef;
  const reflector = { getAllAndOverride: vi.fn(() => false) };
  const validator = { validate: vi.fn(async () => ({ sid: 'sid', sub: 'verified-actor', tenantId: 'verified-tenant', claims: {} })) };
  const permissionCache = { getForSession: vi.fn(async () => ({ permissions: [] })) };
  return new StynxAuthGuard(moduleRef, reflector as never, validator as never, permissionCache as never);
}

function context(request: Record<string | symbol, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('StynxAuthGuard command provenance', () => {
  it('exports an own constructor brand with value true; inheritance and a matching class name are insufficient', () => {
    const brand = (contracts as Record<string, unknown>).STYNX_BUILTIN_AUTH_GUARD as symbol | undefined;
    expect(typeof brand).toBe('symbol');
    expect(Object.hasOwn(StynxAuthGuard, brand!)).toBe(true);
    expect(Reflect.get(StynxAuthGuard, brand!)).toBe(true);
    class DerivedGuard extends StynxAuthGuard {}
    const SameName = class StynxAuthGuard {};
    expect(Object.hasOwn(DerivedGuard, brand!)).toBe(false);
    expect(Object.hasOwn(SameName, brand!)).toBe(false);
  });

  it('clears forged protected claims before verification and replaces them with verified identity', async () => {
    const request: Record<string | symbol, unknown> = {
      headers: { authorization: 'Bearer token' },
      stynxClaims: { sub: 'forged-actor', tenantId: 'forged-tenant' },
      principal: { id: 'forged-actor' },
      user: { id: 'forged-actor' },
      actor: { id: 'forged-actor' },
      tenantId: 'forged-tenant',
    };
    await expect(guard().canActivate(context(request))).resolves.toBe(true);
    expect(request.stynxClaims).toMatchObject({ sub: 'verified-actor', tenantId: 'verified-tenant' });
    expect(request.principal).toMatchObject({ id: 'verified-actor' });
  });
});
