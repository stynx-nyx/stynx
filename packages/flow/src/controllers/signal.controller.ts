import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { Audit } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowRuntimeService } from '../flow-runtime.service';

@Controller('/flow/signal')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowSignalController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.signal', entity: 'flow.runs' })
  @Idempotent('Idempotency-Key')
  @Post()
  signal(@Body() input: unknown) {
    return this.runtime.signal(input);
  }
}
