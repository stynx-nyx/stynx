import { Body, Controller, Delete, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowFormsService } from '../flow-forms.service';

@Controller('/flow/questions')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowQuestionsController {
  constructor(private readonly forms: FlowFormsService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.forms.getQuestion(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.question.update', entity: 'flow.questions' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.forms.updateQuestion(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.question.delete', entity: 'flow.questions' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.forms.deleteQuestion(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id/score')
  score(@Param('id') id: string) {
    return this.forms.getQuestionScore(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.score.put', entity: 'flow.scores' })
  @Idempotent('Idempotency-Key')
  @Put('/:id/score')
  putScore(@Param('id') id: string, @Body() input: unknown) {
    return this.forms.putQuestionScore(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.score.delete', entity: 'flow.scores' })
  @Delete('/:id/score')
  deleteScore(@Param('id') id: string) {
    return this.forms.deleteQuestionScore(id);
  }
}
