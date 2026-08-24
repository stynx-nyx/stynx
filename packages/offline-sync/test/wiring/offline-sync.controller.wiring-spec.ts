import { describe, expect, it, vi } from 'vitest';
import { OfflineSyncController } from '../../src/offline-sync.controller';
import type { OfflineSyncService } from '../../src/offline-sync.service';

function createController() {
  const service = {
    reserveNumbering: vi.fn().mockResolvedValue({ reservationId: 'reservation-1' }),
    cancelNumberingReservation: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    submitSyncBatch: vi.fn().mockResolvedValue({ batchId: 'batch-1' }),
    resolveConflict: vi.fn().mockResolvedValue({ status: 'resolved' }),
  } as unknown as OfflineSyncService;
  return { controller: new OfflineSyncController(service), service };
}

describe('OfflineSyncController wiring', () => {
  it('forwards neutral numbering and sync commands', async () => {
    const { controller, service } = createController();
    const reservation = {
      orgUnitId: 'org-1',
      deviceId: 'device-1',
      shiftId: 'shift-1',
      entityType: 'crash-record',
      requestedSize: 10,
    };
    await controller.reserveNumbering(reservation);
    expect(service.reserveNumbering).toHaveBeenCalledWith(reservation);

    const batch = {
      orgUnitId: 'org-1',
      deviceId: 'device-1',
      deviceBatchId: 'batch-1',
      items: [],
    };
    await controller.submitBatch(batch);
    expect(service.submitSyncBatch).toHaveBeenCalledWith(batch);
  });

  it.each(['tenantId', 'tenant_id', 'agentId', 'actor_id'])(
    'rejects client-supplied trusted identity field %s',
    (field) => {
      const { controller, service } = createController();
      expect(() =>
        controller.reserveNumbering({
          orgUnitId: 'org-1',
          deviceId: 'device-1',
          shiftId: 'shift-1',
          entityType: 'crash-record',
          requestedSize: 1,
          [field]: 'spoofed',
        } as never),
      ).toThrowError(expect.objectContaining({ code: 'OFFLINE_SYNC_CONTEXT_OVERRIDE' }));
      expect(service.reserveNumbering).not.toHaveBeenCalled();
    },
  );

  it('forwards cancellation and all conflict resolution modes', async () => {
    const { controller, service } = createController();
    await controller.cancelNumbering('reservation-1', { reason: 'shift closed' });
    expect(service.cancelNumberingReservation).toHaveBeenCalledWith('reservation-1', {
      reason: 'shift closed',
    });
    for (const resolution of ['device-wins', 'server-wins', 'manual-review'] as const) {
      await controller.resolveConflict(`conflict-${resolution}`, { resolution });
      expect(service.resolveConflict).toHaveBeenCalledWith(`conflict-${resolution}`, {
        resolution,
      });
    }
  });
});
