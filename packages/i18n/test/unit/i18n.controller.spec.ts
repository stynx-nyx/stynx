import 'reflect-metadata';
import { STYNX_NO_IDEMPOTENT_ROUTE } from '@stynx-nyx/idempotency';
import { I18nController } from '../../src/i18n.controller';
import type { I18nAdminService } from '../../src/i18n-admin.service';

function handler(name: string): Function {
  const value = I18nController.prototype[name as keyof I18nController];
  if (typeof value !== 'function') {
    throw new Error(`${name} is not a controller handler`);
  }
  return value;
}

describe('I18nController API contract', () => {
  it('uses request tenant context for list and update operations', async () => {
    const moduleRef = { get: vi.fn(() => ({ tenantId: 'tenant-1' })) };
    const adminService = {
      listTenantOverrides: vi.fn(async () => [{ key: 'records.title' }]),
      updateTenantOverrides: vi.fn(async () => ({ updated: 1 })),
    } as unknown as I18nAdminService;
    const controller = new I18nController(moduleRef as never, adminService);

    await expect(controller.listOverrides()).resolves.toEqual([{ key: 'records.title' }]);
    await expect(
      controller.updateOverrides({ overrides: { 'records.title': 'Records' } }),
    ).resolves.toEqual({
      updated: 1,
    });

    expect(adminService.listTenantOverrides).toHaveBeenCalledWith('tenant-1');
    expect(adminService.updateTenantOverrides).toHaveBeenCalledWith('tenant-1', {
      overrides: { 'records.title': 'Records' },
    });
  });

  it('uses an empty tenant id when request context has no tenant', async () => {
    const moduleRef = { get: vi.fn(() => ({})) };
    const adminService = {
      listTenantOverrides: vi.fn(async () => ({})),
      updateTenantOverrides: vi.fn(async () => ({})),
    } as unknown as I18nAdminService;
    const controller = new I18nController(moduleRef as never, adminService);

    await expect(controller.listOverrides()).resolves.toEqual({});
    await expect(controller.updateOverrides({ locale: 'pt-BR', catalog: {} })).resolves.toEqual({});

    expect(adminService.listTenantOverrides).toHaveBeenCalledWith('');
    expect(adminService.updateTenantOverrides).toHaveBeenCalledWith('', {
      locale: 'pt-BR',
      catalog: {},
    });
  });

  it('keeps override writes outside the idempotency interceptor', () => {
    expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, handler('updateOverrides'))).toBe(true);
  });
});
