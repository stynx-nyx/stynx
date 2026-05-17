import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { Audit, RateLimit } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowRuntimeService } from '../flow-runtime.service';

@Controller('/flow/effects')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowEffectsController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Permission('flow:admin:*')
  @Audit({ action: 'flow.effect.dispatch', entity: 'flow.events' })
  @Idempotent('Idempotency-Key')
  @RateLimit({ bucket: 'tenant', scope: 'flow.effect.dispatch' })
  @Post('/dispatch')
  dispatch(@Body() input: unknown) {
    return this.runtime.dispatchPendingEffects(input);
  }
}
