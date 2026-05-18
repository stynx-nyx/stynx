import 'reflect-metadata';
import { STYNX_NO_IDEMPOTENT_ROUTE } from '@stynx/idempotency';
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
    const moduleRef = { get: jest.fn(() => ({ tenantId: 'tenant-1' })) };
    const adminService = {
      listOverrides: jest.fn(async () => [{ key: 'records.title' }]),
      updateOverrides: jest.fn(async () => ({ updated: 1 })),
    } as unknown as I18nAdminService;
    const controller = new I18nController(moduleRef as never, adminService);

    await expect(controller.listOverrides()).resolves.toEqual([{ key: 'records.title' }]);
    await expect(controller.updateOverrides({ overrides: { 'records.title': 'Records' } })).resolves.toEqual({
      updated: 1,
    });

    expect(adminService.listOverrides).toHaveBeenCalledWith('tenant-1');
    expect(adminService.updateOverrides).toHaveBeenCalledWith('tenant-1', {
      overrides: { 'records.title': 'Records' },
    });
  });

  it('keeps override writes outside the idempotency interceptor', () => {
    expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, handler('updateOverrides'))).toBe(true);
  });
});
