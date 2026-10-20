import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector, type ModuleRef } from '@nestjs/core';
import { StynxAuthGuard, StynxJwtValidator } from '@stynx-nyx/auth';
import {
  SessionJwtSigningService,
  SessionRevocationList,
  resolveSessionsOptions,
  type SessionRecord,
} from '@stynx-nyx/sessions';
import { AuthorizationGuard } from '../../src/authorization/authorization.guard.js';
import { RequirePermissions, RequireRoles } from '../../src/authorization/decorators.js';

// INV-RBAC-001 / S-12 (SM-14): @RequireRoles keeps its all/any semantics when roles come
// from the verified STYNX token, with no session, cache, database or network read.

const issuer = 'https://stynx.roles.test';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const keySet = {
  currentKid: 'roles-key',
  keys: [
    {
      kid: 'roles-key',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    },
  ],
};
const signing = new SessionJwtSigningService(
  resolveSessionsOptions({ issuer, redis: { url: 'redis://unused.invalid:6379' }, jwt: { keySet } }),
);

class RolesController {
  @RequireRoles(['admin', 'auditor'], 'all')
  allRoles(): void {}

  @RequireRoles(['admin', 'auditor'], 'any')
  anyRole(): void {}

  @RequireRoles(['admin', 'auditor'])
  defaultMode(): void {}

  @RequirePermissions(['records:read', 'records:write'], 'any')
  anyPermission(): void {}
}

function context(request: Record<string, unknown>, handler: keyof RolesController): ExecutionContext {
  return {
    getHandler: () => RolesController.prototype[handler],
    getClass: () => RolesController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function tokenFor(roles: string[], permissions: string[] = []): Promise<string> {
  const now = new Date();
  const record: SessionRecord = {
    sid: `sid-${roles.join('-') || 'none'}`,
    userId: 'user-roles',
    tenantId: 'tenant-roles',
    cognitoSub: 'cognito-roles',
    refreshFamilyId: 'family',
    refreshTokenHash: 'hash',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastTouchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
    idleExpiresAt: new Date(now.getTime() + 1_800_000).toISOString(),
    permissions,
    roles,
  };
  return (await signing.signAccessToken(record, now)).token;
}

describe('RequireRoles over verified STYNX token roles', () => {
  const attempts: string[] = [];
  const reflector = new Reflector();
  const moduleRef = {
    get: vi.fn((token: unknown) => {
      if (token === SessionJwtSigningService) return signing;
      if (token === SessionRevocationList) return new SessionRevocationList();
      attempts.push(String((token as { name?: string })?.name ?? token));
      throw new Error('request-path provider lookup');
    }),
  } as unknown as ModuleRef;
  const authGuard = new StynxAuthGuard(
    moduleRef,
    reflector,
    new StynxJwtValidator(moduleRef, {
      stynx: { issuer },
      permissions: { dbFallbackOnRedisDown: false },
    } as never),
  );
  const authorizationGuard = new AuthorizationGuard(reflector);
  const fetchTrap = vi.fn(() => {
    throw new Error('network call on the request path');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchTrap);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    expect(fetchTrap).not.toHaveBeenCalled();
    expect(attempts).toEqual([]);
  });

  async function decide(handler: keyof RolesController, roles: string[], permissions: string[] = []) {
    const request: Record<string, unknown> = {
      headers: { authorization: `Bearer ${await tokenFor(roles, permissions)}` },
    };
    await expect(authGuard.canActivate(context(request, handler))).resolves.toBe(true);
    try {
      return await authorizationGuard.canActivate(context(request, handler));
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      return false;
    }
  }

  it("'all' requires every listed role from the token", async () => {
    await expect(decide('allRoles', ['admin', 'auditor'])).resolves.toBe(true);
    await expect(decide('allRoles', ['ADMIN', 'Auditor', 'extra'])).resolves.toBe(true);
    await expect(decide('allRoles', ['admin'])).resolves.toBe(false);
    await expect(decide('allRoles', [])).resolves.toBe(false);
  });

  it("'any' requires at least one listed role from the token", async () => {
    await expect(decide('anyRole', ['auditor'])).resolves.toBe(true);
    await expect(decide('anyRole', ['admin', 'other'])).resolves.toBe(true);
    await expect(decide('anyRole', ['other'])).resolves.toBe(false);
    await expect(decide('anyRole', [])).resolves.toBe(false);
  });

  it("defaults to 'all' and evaluates permissions from the same verified claims", async () => {
    await expect(decide('defaultMode', ['admin'])).resolves.toBe(false);
    await expect(decide('defaultMode', ['admin', 'auditor'])).resolves.toBe(true);
    await expect(decide('anyPermission', [], ['records:write'])).resolves.toBe(true);
    await expect(decide('anyPermission', ['admin'], ['records:delete'])).resolves.toBe(false);
  });
});
