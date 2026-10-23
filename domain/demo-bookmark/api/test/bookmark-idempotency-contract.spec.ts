import { RequestMethod, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PermissionGuard, STYNX_PERMISSION_ROUTE, StynxAuthGuard } from '@stynx-nyx/auth';
import {
  IdempotencyInterceptor,
  STYNX_IDEMPOTENT_ROUTE,
  STYNX_NO_IDEMPOTENT_ROUTE,
  type IdempotencyStore,
} from '@stynx-nyx/idempotency';
import { firstValueFrom, of } from 'rxjs';
import { BookmarkController } from '../src/demo-bookmark/controllers/bookmark.controller.js';
import { BookmarkTagController } from '../src/demo-bookmark/controllers/bookmark-tag.controller.js';

const routes = [
  {
    name: 'bookmark create',
    controller: BookmarkController,
    handler: BookmarkController.prototype.create,
    base: '/api/demo/bookmark/bookmark',
    path: '/',
    method: RequestMethod.POST,
  },
  {
    name: 'bookmark update',
    controller: BookmarkController,
    handler: BookmarkController.prototype.update,
    base: '/api/demo/bookmark/bookmark',
    path: ':id',
    method: RequestMethod.PATCH,
  },
  {
    name: 'bookmark tag create',
    controller: BookmarkTagController,
    handler: BookmarkTagController.prototype.create,
    base: '/api/demo/bookmark/bookmark-tag',
    path: '/',
    method: RequestMethod.POST,
  },
];

// ADR-DEVAI-ADOPTION-0027: make the existing per-request transaction behavior
// explicit; adding lint metadata must not introduce an idempotency-key contract.
describe('demo bookmark explicit non-idempotent route contract', () => {
  for (const route of routes) {
    it(`${route.name} preserves method, path, guards and permission metadata`, () => {
      expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, route.handler)).toBe(true);
      expect(Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, route.handler)).toBe(undefined);
      expect(Reflect.getMetadata(METHOD_METADATA, route.handler)).toBe(route.method);
      expect(Reflect.getMetadata(PATH_METADATA, route.handler)).toBe(route.path);
      expect(Reflect.getMetadata(PATH_METADATA, route.controller)).toBe(route.base);
      expect(Reflect.getMetadata(GUARDS_METADATA, route.controller)).toEqual([
        StynxAuthGuard,
        PermissionGuard,
      ]);
      expect(Reflect.getMetadata(STYNX_PERMISSION_ROUTE, route.handler)).toBe(
        'demo:bookmark:write',
      );
    });

    it(`${route.name} executes each request without a key, durable store access or replay headers`, async () => {
      const store = {
        lookup: vi.fn<IdempotencyStore['lookup']>(),
        reserve: vi.fn<IdempotencyStore['reserve']>(),
        persistResponse: vi.fn<IdempotencyStore['persistResponse']>(),
        clearReservation: vi.fn<IdempotencyStore['clearReservation']>(),
      } satisfies IdempotencyStore;
      const interceptor = new IdempotencyInterceptor(new Reflector(), {}, store);
      const response = { setHeader: vi.fn(), status: vi.fn() };
      const context = {
        getHandler: () => route.handler,
        getClass: () => route.controller,
        switchToHttp: () => ({
          getRequest: () => ({ headers: {}, method: route.method }),
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext;
      let executions = 0;
      const next = {
        handle: vi.fn(() => of({ execution: ++executions })),
      } satisfies CallHandler;

      await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
        execution: 1,
      });
      await expect(firstValueFrom(interceptor.intercept(context, next))).resolves.toEqual({
        execution: 2,
      });
      expect(next.handle).toHaveBeenCalledTimes(2);
      for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
    });
  }
});
