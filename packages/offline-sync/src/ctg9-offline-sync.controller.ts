import { BadRequestException, Body, Controller, Param, Post, Get, UseGuards, Headers, Req, Res, Optional } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit } from '@stynx-nyx/backend';
import { Idempotent, NoIdempotent } from '@stynx-nyx/idempotency';
import { OfflineSyncConfigurationError, OfflineSyncError } from './errors';
import { OfflineSyncService } from './offline-sync.service';
import type {
  CancelNumberingReservationInput,
  ReserveNumberingInput,
  ResolveSyncConflictInput,
  SubmitSyncBatchInput,
  ReconcileNumberingInput,
  SettleNumberingInput,
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
export class CTG9OfflineSyncController {
  constructor(private readonly service: OfflineSyncService,
    @Optional() private readonly requestContext?: RequestContext) {}

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

  @Post('numbering-reservations/:id/block')
  @Permission('offline-sync:numbering:block')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-blocked', entity: 'offline.numbering_reservations' })
  blockNumbering(@Param('id') id: string, @Body() input: CancelNumberingReservationInput) {
    this.rejectContextOverrides(input);
    return this.service.blockNumberingReservation(id,input);
  }

  @Post('numbering-reservations/:id/close')
  @Permission('offline-sync:numbering:close')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-closed', entity: 'offline.numbering_reservations' })
  closeNumbering(@Param('id') id: string, @Body() input: CancelNumberingReservationInput) {
    this.rejectContextOverrides(input);
    return this.service.closeNumberingReservation(id,input);
  }

  @Post('numbering-reservations/:id/reconcile')
  @Permission('offline-sync:numbering:reconcile')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-reconciled', entity: 'offline.numbering_reservations' })
  reconcileNumbering(@Param('id') id: string, @Body() input: ReconcileNumberingInput) {
    this.rejectContextOverrides(input);
    return this.service.reconcileNumberingReservation(id,input);
  }

  @Post('numbering-reservations/:id/settle')
  @Permission('offline-sync:numbering:settle')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.numbering-settled', entity: 'offline.numbering_reservations' })
  settleNumbering(@Param('id') id: string, @Body() input: SettleNumberingInput) {
    this.rejectContextOverrides(input);
    return this.service.settleNumberingReservation(id,input);
  }

  @Get('numbering-reservations/:id/consumption')
  @Permission('offline-sync:numbering:read')
  getConsumption(@Param('id') id: string) { return this.service.getNumberingConsumption(id); }

  @Get('sync-batches/:deviceId/:deviceBatchId/receipt')
  @Permission('offline-sync:batches:read')
  getBatchReceipt(@Param('deviceId') deviceId: string, @Param('deviceBatchId') deviceBatchId: string) {
    return this.service.getSyncBatchReceipt(deviceId,deviceBatchId);
  }

  @Get('sync-items/:idempotencyKey/receipt')
  @Permission('offline-sync:items:read')
  getItemReceipt(@Param('idempotencyKey') key: string) { return this.service.getSyncItemReceipt(key); }

  @Post('sync-batches')
  @Permission('offline-sync:batches:submit')
  @NoIdempotent()
  @Audit({ action: 'offline-sync.batch-submitted', entity: 'offline.sync_queue_items' })
  async submitBatch(@Body() input: SubmitSyncBatchInput, @Headers('idempotency-key') key: string | undefined, @Req() req: { body: unknown; originalUrl?: string; url?: string; principal?: {id?:string}; actor?: {id?:string}; user?: {id?:string} }, @Res({ passthrough: true }) response: { status(code: number): unknown; setHeader(name: string, value: string): unknown }) {
    this.rejectContextOverrides(input);
    if (!key?.trim()) throw new BadRequestException('Idempotency-Key header is required for idempotent routes');
    try {
      const path = (req.originalUrl ?? req.url ?? '/offline-sync/sync-batches').split('?')[0]!;
      const userId = req.principal?.id ?? req.actor?.id ?? req.user?.id;
      const result = await this.service.submitSyncBatch(input, { transportIdempotencyKey: key, method: 'POST', path, transportUserId:userId ?? null, requestBody: req.body, response });
      if (result.receipt?.status === 'open') {
        response.setHeader('Retry-After','1');
        throw new OfflineSyncError('OFFLINE_SYNC:BATCH:in-progress',503,'Batch is in progress.',true);
      }
      return result;
    } catch (error) {
      if (error instanceof OfflineSyncError && error.code === 'OFFLINE_SYNC:BATCH:in-progress') {
        response.setHeader('Retry-After', '1');
        const requestId = this.requestContext?.hasActiveContext() ? this.requestContext.requestId : undefined;
        if (!requestId) throw new OfflineSyncConfigurationError('RequestContext');
        throw new OfflineSyncError(error.code,503,error.message,true,requestId);
      }
      throw error;
    }
  }

  @Post('conflicts/:id/resolve')
  @Permission('offline-sync:conflicts:resolve')
  @Idempotent('Idempotency-Key')
  @Audit({ action: 'offline-sync.conflict-resolved', entity: 'offline.sync_conflicts' })
  resolveConflict(@Param('id') id: string, @Body() input: ResolveSyncConflictInput) {
    this.rejectContextOverrides(input);
    return this.service.resolveConflict(id, input);
  }

  protected rejectContextOverrides(input: unknown): void {
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
