import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { StynxAuditController } from '../../src/audit.controller';
import type { StynxAuditService } from '../../src/audit.service';

function handler(name: string): Function {
  const value = StynxAuditController.prototype[name as keyof StynxAuditController];
  if (typeof value !== 'function') {
    throw new Error(`${name} is not a controller handler`);
  }
  return value;
}

function metadataValues(target: Function): unknown[] {
  return Reflect.getMetadataKeys(target).map((key) => Reflect.getMetadata(key, target));
}

describe('StynxAuditController API contract', () => {
  it('keeps audit log access guarded and permission-bound', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler('list'))).toEqual([
      StynxAuthGuard,
      PermissionGuard,
    ]);
    expect(metadataValues(handler('list'))).toContain('platform:audit:read:*');
  });

  it('delegates audit log queries to the audit service', () => {
    const service = {
      listLog: vi.fn(() => [{ id: 'audit-1' }]),
    } as unknown as StynxAuditService;
    const controller = new StynxAuditController(service);

    expect(controller.list({ actorId: 'actor-1' })).toEqual([{ id: 'audit-1' }]);
    expect(service.listLog).toHaveBeenCalledWith({ actorId: 'actor-1' });
  });
});
