import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import {
  STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL,
  STYNX_VERIFIED_TENANT_ID,
} from '@stynx-nyx/contracts';
import * as contracts from '@stynx-nyx/contracts';
import { Database } from '@stynx-nyx/data';
import { lastValueFrom, of } from 'rxjs';
import { StynxTenancyModule } from '../../src/tenancy.module.js';
import { TenantContextInterceptor } from '../../src/tenant-context.interceptor.js';

// INV-RBAC-001: only successful tenancy validation publishes command actor provenance.
const TENANT = '018f53e4-28a1-7cd8-a0ff-5b22c3a07111';
const OTHER_TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const ACTOR = '018f53e4-28a1-7cd8-a0ff-5b22c3a07112';
const OTHER_ACTOR = '018f53e4-28a1-7cd8-a0ff-5b22c3a07113';
const NOMINAL = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function context(
  request: Record<string | symbol, unknown>,
  route: 'protected' | 'public' | 'optional',
): ExecutionContext {
  const handler = () => undefined;
  if (route !== 'protected') {
    Reflect.defineMetadata(
      (contracts as Record<string, unknown>).STYNX_PUBLIC_TENANT_ROUTE as symbol,
      route === 'optional' ? { optionalAuth: true } : true,
      handler,
    );
  }
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

async function setup(allowed = true) {
  const query = vi.fn(async () => ({ rows: [{ allowed }] }));
  const database = {
    hasHeldConnection: vi.fn(() => false),
    withSystemContext: vi.fn(async (_reason: string, callback: () => Promise<unknown>) =>
      callback(),
    ),
    txIndependent: vi.fn(async (callback: (trx: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
    ),
  };
  const module = await Test.createTestingModule({
    imports: [
      StynxTenancyModule.forRoot({ publicTenant: { actorId: NOMINAL, resolveHost: () => TENANT } }),
    ],
    providers: [{ provide: Database, useValue: database }],
  }).compile();
  const token = (contracts as Record<string, unknown>).STYNX_RESOLVED_TENANT_COMMAND_CONTEXT as
    symbol | undefined;
  expect(typeof token).toBe('symbol');
  const port = module.get<{ get(request: object): unknown }>(token!, { strict: false });
  const interceptor = module.get(TenantContextInterceptor, { strict: false });
  const mutator = module.get(RequestContextMutator, { strict: false });
  const run = (
    request: Record<string | symbol, unknown>,
    route: 'protected' | 'public' | 'optional',
  ) => {
    const principal = request.principal as { id?: string } | undefined;
    const seed = {
      requestId: 'req',
      startedAt: new Date(),
      ...(principal?.id ? { actorId: principal.id } : {}),
    };
    return mutator.runWithRequestContext(seed, () =>
      lastValueFrom(
        interceptor.intercept(context(request, route), {
          handle: () => of('handled'),
        } as CallHandler),
      ),
    );
  };
  const requestContext = module.get(RequestContext, { strict: false });
  return { module, port, run, query, database, mutator, requestContext };
}

describe('resolved tenant command context port', () => {
  it('exposes get only, including its prototype, and ignores forged request fields and symbols', async () => {
    const { module, port } = await setup();
    try {
      expect(Object.getOwnPropertyNames(port).filter((name) => name !== 'get')).toEqual([]);
      expect(
        Object.getOwnPropertyNames(Object.getPrototypeOf(port)).filter(
          (name) => name !== 'constructor' && name !== 'get',
        ),
      ).toEqual([]);
      const forged: Record<string | symbol, unknown> = {
        user: { id: ACTOR },
        actor: { id: ACTOR },
        principal: { id: ACTOR },
        stynxClaims: { sub: ACTOR, tenantId: TENANT },
        tenantId: TENANT,
      };
      for (const value of Object.values(contracts)) {
        if (typeof value === 'symbol') forged[value] = true;
      }
      expect(port.get(forged)).toBe(undefined);
    } finally {
      await module.close();
    }
  });

  it('records exact nominal identity only after Host resolution, then ignores unresolved optional paths', async () => {
    const { module, port, run } = await setup();
    try {
      const request = { headers: { host: 'portal.test' }, originalUrl: '/portal/records' };
      expect(port.get(request)).toBe(undefined);
      await expect(run(request, 'public')).resolves.toBe('handled');
      expect(port.get(request)).toEqual({ tenantId: TENANT, actorId: NOMINAL, mode: 'nominal' });
      const optional = { headers: {}, originalUrl: '/readyz' };
      await expect(run(optional, 'protected')).resolves.toBe('handled');
      expect(port.get(optional)).toBe(undefined);
      expect(Object.hasOwn(optional, 'tenantId')).toBe(false);
    } finally {
      await module.close();
    }
  });

  it('does not attest a protected actor different from the exact membership-checked bearer subject', async () => {
    const { module, port, run, query } = await setup();
    try {
      const request: Record<string | symbol, unknown> = {
        headers: {
          'x-tenant-id': TENANT,
          authorization: `Bearer h.${Buffer.from(JSON.stringify({ sub: OTHER_ACTOR, tenant_id: TENANT })).toString('base64url')}.s`,
        },
        originalUrl: '/records',
        principal: { id: ACTOR },
      };
      Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
      await expect(run(request, 'protected')).resolves.toBe('handled');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('auth.memberships'), [
        OTHER_ACTOR,
        TENANT,
      ]);
      expect(port.get(request)).toBe(undefined);
    } finally {
      await module.close();
    }
  });

  it('attests the exact protected actor and tenant after membership validation and context patch', async () => {
    const { module, port, run, query } = await setup();
    try {
      const request: Record<string | symbol, unknown> = {
        headers: { 'x-tenant-id': TENANT },
        originalUrl: '/records',
        principal: { id: ACTOR },
      };
      Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
      expect(port.get(request)).toBe(undefined);
      await expect(run(request, 'protected')).resolves.toBe('handled');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('auth.memberships'), [
        ACTOR,
        TENANT,
      ]);
      expect(port.get(request)).toEqual({ tenantId: TENANT, actorId: ACTOR, mode: 'protected' });
    } finally {
      await module.close();
    }
  });

  it('rejects forged verified-public claims that disagree with principal and Host', async () => {
    const { module, port, run } = await setup();
    try {
      const request: Record<string | symbol, unknown> = {
        headers: { host: 'portal.test' },
        originalUrl: '/portal/records',
        principal: { id: ACTOR },
        stynxClaims: { sub: OTHER_ACTOR, tenantId: TENANT },
      };
      Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
      await expect(run(request, 'optional')).resolves.toBe('handled');
      expect(port.get(request)).toBe(undefined);
      const wrongTenant = { ...request, stynxClaims: { sub: ACTOR, tenantId: OTHER_TENANT } };
      await expect(run(wrongTenant, 'optional')).rejects.toThrow();
      expect(port.get(wrongTenant)).toBe(undefined);
    } finally {
      await module.close();
    }
  });

  it('attests a verified public principal only when Host, claims, and active actor agree', async () => {
    const { module, port, run, query } = await setup();
    try {
      const request: Record<string | symbol, unknown> = {
        headers: { host: 'portal.test' },
        originalUrl: '/portal/records',
        principal: { id: ACTOR },
        stynxClaims: { sub: ACTOR, tenantId: TENANT, sid: 'session-1' },
      };
      Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);

      expect(port.get(request)).toBe(undefined);
      await expect(run(request, 'optional')).resolves.toBe('handled');
      expect(query).toHaveBeenCalledWith(expect.stringContaining('auth.memberships'), [
        ACTOR,
        TENANT,
      ]);
      expect(port.get(request)).toEqual({ tenantId: TENANT, actorId: ACTOR, mode: 'verified' });
    } finally {
      await module.close();
    }
  });

  it('publishes no result after membership failure', async () => {
    const { module, port, run } = await setup(false);
    try {
      const request: Record<string | symbol, unknown> = {
        headers: { 'x-tenant-id': TENANT },
        originalUrl: '/records',
        principal: { id: ACTOR },
      };
      Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
      await expect(run(request, 'protected')).rejects.toThrow();
      expect(port.get(request)).toBe(undefined);
    } finally {
      await module.close();
    }
  });

  it('scopes restricted membership SQL without publishing a command proof and restores its caller frame', async () => {
    const { module, port, run, query, database, mutator, requestContext } = await setup();
    const request: Record<string | symbol, unknown> = {
      headers: { 'x-tenant-id': TENANT },
      originalUrl: '/records',
      principal: { id: ACTOR },
    };
    Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
    const frames: unknown[] = [];
    query.mockImplementation(async () => {
      frames.push(requestContext.snapshot());
      expect(port.get(request)).toBe(undefined);
      return { rows: [{ allowed: true }] };
    });
    const outer = {
      requestId: 'outer',
      startedAt: new Date(),
      tenantId: OTHER_TENANT,
      actorId: OTHER_ACTOR,
    };
    try {
      await mutator.runWithRequestContext(outer, async () => {
        await expect(run(request, 'protected')).resolves.toBe('handled');
        expect(requestContext.snapshot()).toEqual(outer);
      });
      expect(frames).toEqual([expect.objectContaining({ tenantId: TENANT, actorId: ACTOR })]);
      expect(database.txIndependent).toHaveBeenCalledWith(expect.any(Function), {
        role: 'reader',
        readonly: true,
        replica: false,
      });
      expect(database.withSystemContext).not.toHaveBeenCalled();
      expect(port.get(request)).toEqual({ tenantId: TENANT, actorId: ACTOR, mode: 'protected' });
    } finally {
      await module.close();
    }
  });

  it('checks public tenant activity as the configured nominal actor and optional membership as the verified actor', async () => {
    const { module, port, run, query, database, requestContext } = await setup();
    const request: Record<string | symbol, unknown> = {
      headers: { host: 'portal.test' },
      originalUrl: '/portal/records',
      principal: { id: ACTOR },
      stynxClaims: { sub: ACTOR, tenantId: TENANT },
    };
    Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
    const frames: unknown[] = [];
    query.mockImplementation(async () => {
      frames.push(requestContext.snapshot());
      expect(port.get(request)).toBe(undefined);
      return { rows: [{ allowed: true }] };
    });
    try {
      await expect(run(request, 'optional')).resolves.toBe('handled');
      expect(frames).toEqual([
        expect.objectContaining({ tenantId: TENANT, actorId: NOMINAL }),
        expect.objectContaining({ tenantId: TENANT, actorId: ACTOR }),
      ]);
      expect(database.txIndependent).toHaveBeenCalledTimes(2);
      expect(database.txIndependent).toHaveBeenCalledWith(expect.any(Function), {
        role: 'reader',
        readonly: true,
        replica: false,
      });
      expect(database.withSystemContext).not.toHaveBeenCalled();
      expect(port.get(request)).toEqual({ tenantId: TENANT, actorId: ACTOR, mode: 'verified' });
    } finally {
      await module.close();
    }
  });

  it('propagates admission infrastructure failure without proof or leaking its temporary SQL frame', async () => {
    const { module, port, run, query, mutator, requestContext } = await setup();
    const request: Record<string | symbol, unknown> = {
      headers: { 'x-tenant-id': TENANT },
      originalUrl: '/records',
      principal: { id: ACTOR },
    };
    Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
    const failure = new Error('external SQL connection refused');
    query.mockRejectedValueOnce(failure);
    const outer = {
      requestId: 'outer-failure',
      startedAt: new Date(),
      tenantId: OTHER_TENANT,
      actorId: OTHER_ACTOR,
    };
    try {
      await mutator.runWithRequestContext(outer, async () => {
        await expect(run(request, 'protected')).rejects.toBe(failure);
        expect(requestContext.snapshot()).toEqual(outer);
        expect(port.get(request)).toBe(undefined);
      });
      expect(Object.hasOwn(request, 'tenantId')).toBe(false);
    } finally {
      await module.close();
    }
  });
});
