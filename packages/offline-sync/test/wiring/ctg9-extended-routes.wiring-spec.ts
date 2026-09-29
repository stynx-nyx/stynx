import { describe, expect, it, vi } from 'vitest';
import { CTG9OfflineSyncController } from '../../src/ctg9-offline-sync.controller';
import type { OfflineSyncService } from '../../src/offline-sync.service';

// INV-OFFLINE-001; UPS-OFS-01…04. CTG9 routes retain trusted scope and
// forward every extended command/read to the service with its route identity.
function createController() {
  const service = {
    reserveNumbering: vi.fn().mockResolvedValue({ reservationId: 'reservation-1' }),
    cancelNumberingReservation: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    blockNumberingReservation: vi.fn().mockResolvedValue({ status: 'blocked' }),
    closeNumberingReservation: vi.fn().mockResolvedValue({ status: 'closed' }),
    reconcileNumberingReservation: vi.fn().mockResolvedValue({ status: 'reconciled' }),
    settleNumberingReservation: vi.fn().mockResolvedValue({ status: 'settled' }),
    getNumberingConsumption: vi.fn().mockResolvedValue([{ number: 1000, status: 'applied' }]),
    getSyncBatchReceipt: vi.fn().mockResolvedValue({ deviceBatchId: 'batch-1' }),
    getSyncItemReceipt: vi.fn().mockResolvedValue({ idempotencyKey: 'item-1' }),
    resolveConflict: vi.fn().mockResolvedValue({ status: 'resolved' }),
  };
  return {
    controller: new CTG9OfflineSyncController(service as unknown as OfflineSyncService),
    service,
  };
}

describe('CTG9 extended controller wiring', () => {
  it('forwards numbering lifecycle commands with the route reservation ID', async () => {
    const { controller, service } = createController();
    const reserve = {
      orgUnitId: 'org-1', deviceId: 'device-1', shiftId: 'shift-1',
      entityType: 'citation', requestedSize: 3,
    };
    const reason = { reason: 'shift ended' };
    const reconcile = { reason: 'shift ended', consumedNumbers: [1000] };
    const settle = { action: 'close', reason: 'shift ended', userRef: 'review-1' };

    await expect(controller.reserveNumbering(reserve)).resolves.toEqual({ reservationId: 'reservation-1' });
    await expect(controller.cancelNumbering('reservation-1', reason)).resolves.toEqual({ status: 'cancelled' });
    await expect(controller.blockNumbering('reservation-1', reason)).resolves.toEqual({ status: 'blocked' });
    await expect(controller.closeNumbering('reservation-1', reason)).resolves.toEqual({ status: 'closed' });
    await expect(controller.reconcileNumbering('reservation-1', reconcile as never)).resolves.toEqual({ status: 'reconciled' });
    await expect(controller.settleNumbering('reservation-1', settle as never)).resolves.toEqual({ status: 'settled' });

    expect(service.reserveNumbering).toHaveBeenCalledExactlyOnceWith(reserve);
    expect(service.cancelNumberingReservation).toHaveBeenCalledExactlyOnceWith('reservation-1', reason);
    expect(service.blockNumberingReservation).toHaveBeenCalledExactlyOnceWith('reservation-1', reason);
    expect(service.closeNumberingReservation).toHaveBeenCalledExactlyOnceWith('reservation-1', reason);
    expect(service.reconcileNumberingReservation).toHaveBeenCalledExactlyOnceWith('reservation-1', reconcile);
    expect(service.settleNumberingReservation).toHaveBeenCalledExactlyOnceWith('reservation-1', settle);
  });

  it('forwards consumption and receipt reads with their complete route identity', async () => {
    const { controller, service } = createController();
    await expect(controller.getConsumption('reservation-1')).resolves.toEqual([
      { number: 1000, status: 'applied' },
    ]);
    await expect(controller.getBatchReceipt('device-1', 'batch-1')).resolves.toEqual({
      deviceBatchId: 'batch-1',
    });
    await expect(controller.getItemReceipt('item-1')).resolves.toEqual({ idempotencyKey: 'item-1' });
    expect(service.getNumberingConsumption).toHaveBeenCalledExactlyOnceWith('reservation-1');
    expect(service.getSyncBatchReceipt).toHaveBeenCalledExactlyOnceWith('device-1', 'batch-1');
    expect(service.getSyncItemReceipt).toHaveBeenCalledExactlyOnceWith('item-1');
  });

  it('forwards conflict resolution without rewriting the requested action', async () => {
    const { controller, service } = createController();
    const resolution = { resolution: 'retry_after_correction', reason: 'corrected locally' };
    await expect(controller.resolveConflict('conflict-1', resolution as never)).resolves.toEqual({
      status: 'resolved',
    });
    expect(service.resolveConflict).toHaveBeenCalledExactlyOnceWith('conflict-1', resolution);
  });

  it.each(['tenantId', 'tenant_id', 'agentId', 'agent_id', 'actorId', 'actor_id', 'userId', 'user_id'])(
    'rejects client supplied trusted %s before a numbering or conflict effect', (field) => {
      const { controller, service } = createController();
      expect(() => controller.blockNumbering('reservation-1', {
        reason: 'shift ended', [field]: 'spoofed',
      } as never)).toThrowError(expect.objectContaining({ code: 'OFFLINE_SYNC_CONTEXT_OVERRIDE' }));
      expect(() => controller.resolveConflict('conflict-1', {
        resolution: 'reject', [field]: 'spoofed',
      } as never)).toThrowError(expect.objectContaining({ code: 'OFFLINE_SYNC_CONTEXT_OVERRIDE' }));
      expect(service.blockNumberingReservation).not.toHaveBeenCalled();
      expect(service.resolveConflict).not.toHaveBeenCalled();
    },
  );
});
