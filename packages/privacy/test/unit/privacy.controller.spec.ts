import 'reflect-metadata';
import { STYNX_NO_IDEMPOTENT_ROUTE } from '@stynx/idempotency';
import { PrivacyController } from '../../src/privacy.controller';
import type { PrivacyService } from '../../src/privacy.service';

function handler(name: string): Function {
  const value = PrivacyController.prototype[name as keyof PrivacyController];
  if (typeof value !== 'function') {
    throw new Error(`${name} is not a controller handler`);
  }
  return value;
}

describe('PrivacyController API contract', () => {
  it('delegates export, erasure, and retention requests to the privacy service', async () => {
    const service = {
      exportData: jest.fn(async () => ({ downloadUrl: 'memory://export' })),
      eraseSubject: jest.fn(async () => ({ actions: [] })),
      applyRetention: jest.fn(async () => ({ dryRun: true, actions: [] })),
    } as unknown as PrivacyService;
    const controller = new PrivacyController(service);

    await expect(controller.exportData({ subjectUserId: 'user-1', format: 'json' })).resolves.toEqual({
      downloadUrl: 'memory://export',
    });
    await expect(controller.eraseSubject({ subjectUserId: 'user-1' })).resolves.toEqual({ actions: [] });
    await expect(controller.applyRetention()).resolves.toEqual({ dryRun: true, actions: [] });
    await expect(controller.applyRetention('false')).resolves.toEqual({ dryRun: true, actions: [] });

    expect(service.exportData).toHaveBeenCalledWith({ subjectUserId: 'user-1', format: 'json' });
    expect(service.eraseSubject).toHaveBeenCalledWith({ subjectUserId: 'user-1' });
    expect(service.applyRetention).toHaveBeenNthCalledWith(1, true);
    expect(service.applyRetention).toHaveBeenNthCalledWith(2, false);
  });

  it('keeps privacy mutations explicitly non-idempotent', () => {
    expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, handler('exportData'))).toBe(true);
    expect(Reflect.getMetadata(STYNX_NO_IDEMPOTENT_ROUTE, handler('eraseSubject'))).toBe(true);
  });
});
