import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit } from '@stynx-nyx/backend';
import { Idempotent } from '@stynx-nyx/idempotency';
import { OfflineSyncError } from './errors';
import { OfflineSyncService } from './offline-sync.service';
import type {
  CancelNumberingReservationInput,
  ReserveNumberingInput,
  ResolveSyncConflictInput,
  SubmitSyncBatchInput,
} from './types';

const identityKeys = new Set([
  'tenantId',
  'tenant_id',
  'agentId',
  'agent_id',
  'actorId',
  'actor_id',
  'userId',
  'user_id',
]);

@Controller('offline-sync')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class OfflineSyncController {
  constructor(private readonly service: OfflineSyncService) {}

  @Post('numbering-reservations')
  @Permission('offline-sync:numbering:reserve')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-reserved', entity: 'offline.numbering_reservations' })
  reserveNumbering(@Body() input: ReserveNumberingInput) {
    this.rejectContextOverrides(input);
    return this.service.reserveNumbering(input);
  }

  @Post('numbering-reservations/:id/cancel')
  @Permission('offline-sync:numbering:cancel')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-cancelled', entity: 'offline.numbering_reservations' })
  cancelNumbering(@Param('id') id: string, @Body() input: CancelNumberingReservationInput) {
    this.rejectContextOverrides(input);
    return this.service.cancelNumberingReservation(id, input);
  }

  @Post('sync-batches')
  @Permission('offline-sync:batches:submit')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.batch-submitted', entity: 'offline.sync_queue_items' })
  submitBatch(@Body() input: SubmitSyncBatchInput) {
    this.rejectContextOverrides(input);
    return this.service.submitSyncBatch(input);
  }

  @Post('conflicts/:id/resolve')
  @Permission('offline-sync:conflicts:resolve')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.conflict-resolved', entity: 'offline.sync_conflicts' })
  resolveConflict(@Param('id') id: string, @Body() input: ResolveSyncConflictInput) {
    this.rejectContextOverrides(input);
    return this.service.resolveConflict(id, input);
  }

  private rejectContextOverrides(input: unknown): void {
    if (
      input &&
      typeof input === 'object' &&
      Object.keys(input).some((key) => identityKeys.has(key))
    ) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONTEXT_OVERRIDE',
        400,
        'Tenant and actor identity are derived from trusted request context.',
      );
    }
  }
}
