import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowFormsService } from '../flow-forms.service';

@Controller('/flow/forms')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowFormsController {
  constructor(private readonly forms: FlowFormsService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get()
  list(@Query('scopeId') scopeId?: string) {
    return this.forms.listForms(scopeId);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.forms.getForm(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.form.create', entity: 'flow.forms' })
  @NoIdempotent()
  @Post()
  create(@Body() input: unknown) {
    return this.forms.createForm(input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.form.update', entity: 'flow.forms' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.forms.updateForm(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.form.delete', entity: 'flow.forms' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.forms.deleteForm(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:formId/questions')
  questions(@Param('formId') formId: string) {
    return this.forms.listQuestions(formId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.question.create', entity: 'flow.questions' })
  @NoIdempotent()
  @Post('/:formId/questions')
  createQuestion(@Param('formId') formId: string, @Body() input: unknown) {
    return this.forms.createQuestion(formId, input);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:formId/fills')
  fills(@Param('formId') formId: string) {
    return this.forms.listFormFills(formId);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:formId/fills/:fillId')
  fillDetail(@Param('formId') formId: string, @Param('fillId') fillId: string) {
    return this.forms.getFormFill(formId, fillId);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:formId/fills/:fillId/answers')
  fillAnswers(@Param('formId') formId: string, @Param('fillId') fillId: string) {
    return this.forms.listFormFillAnswers(formId, fillId);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:formId/fills/:fillId/waivers')
  fillWaivers(@Param('formId') formId: string, @Param('fillId') fillId: string) {
    return this.forms.listFormFillWaivers(formId, fillId);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.fill.create', entity: 'flow.fills' })
  @Idempotent('Idempotency-Key')
  @Post('/:formId/fills')
  createFill(@Param('formId') formId: string, @Body() input: unknown) {
    return this.forms.createFill(formId, input);
  }

  @Permission('flow:assign:task')
  @Audit({ action: 'flow.waiver.create', entity: 'flow.waivers' })
  @Idempotent('Idempotency-Key')
  @Post('/:formId/fills/:fillId/waivers')
  createFillWaiver(@Param('formId') formId: string, @Param('fillId') fillId: string, @Body() input: unknown) {
    return this.forms.createFormFillWaiver(formId, fillId, input);
  }
}
