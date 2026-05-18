import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { STYNX_NO_IDEMPOTENT_ROUTE } from '@stynx/idempotency';
import { TenancyController } from '../../src/tenancy.controller';
import { TenancyPlatformAdminGuard } from '../../src/tenancy-platform-admin.guard';
import type { TenancyService } from '../../src/tenancy.service';

function handler(name: string): Function {
  const value = TenancyController.prototype[name as keyof TenancyController];
  if (typeof value !== 'function') {
    throw new Error(`${name} is not a controller handler`);
  }
  return value;
}

describe('TenancyController API contract', () => {
  it('keeps tenant administration behind the platform admin guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenancyController)).toEqual([TenancyPlatformAdminGuard]);
  });

  it('delegates tenant read and mutation operations to the service', async () => {
    const service = {
      listTenants: vi.fn(async () => [{ id: 'tenant-1' }]),
      getTenant: vi.fn(async () => ({ id: 'tenant-1' })),
      provisionTenant: vi.fn(async () => ({ id: 'tenant-2' })),
      updateTenant: vi.fn(async () => ({ id: 'tenant-1', name: 'Updated' })),
      suspendTenant: vi.fn(async () => ({ id: 'tenant-1', state: 'suspended' })),
      archiveTenant: vi.fn(async () => ({ id: 'tenant-1', state: 'archived' })),
      purgeTenant: vi.fn(async () => ({ id: 'tenant-1', state: 'purged' })),
    } as unknown as TenancyService;
    const controller = new TenancyController(service);

    await expect(controller.list()).resolves.toEqual([{ id: 'tenant-1' }]);
    await expect(controller.get('tenant-1')).resolves.toEqual({ id: 'tenant-1' });
    await expect(controller.create({ slug: 'tenant-2', name: 'Tenant 2' })).resolves.toEqual({ id: 'tenant-2' });
    await expect(controller.update('tenant-1', { name: 'Updated' })).resolves.toEqual({
      id: 'tenant-1',
      name: 'Updated',
    });
    await expect(controller.suspend('tenant-1', { reason: 'billing' })).resolves.toEqual({
      id: 'tenant-1',
      state: 'suspended',
    });
    await expect(controller.archive('tenant-1')).resolves.toEqual({ id: 'tenant-1', state: 'archived' });
    await expect(controller.purge('tenant-1')).resolves.toEqual({ id: 'tenant-1', state: 'purged' });
  });

  it('keeps tenant mutations outside the idempotency interceptor', () => {
    for (const methodName of ['create', 'update', 'suspend', 'archive', 'purge']) {
      expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, handler(methodName))).toBe(true);
    }
  });
});
