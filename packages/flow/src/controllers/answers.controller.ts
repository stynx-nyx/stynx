import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit, NoIdempotent } from '@stynx-nyx/backend';
import { FlowFormsService } from '../flow-forms.service';
import type { UpdateFlowAnswerDto } from '../types';

@Controller('/flow/answers')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowAnswersController {
  constructor(private readonly forms: FlowFormsService) {}

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.answer.update', entity: 'flow.answers' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowAnswerDto) {
    return this.forms.updateAnswer(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.answer.delete', entity: 'flow.answers' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.forms.deleteAnswer(id);
  }
}
