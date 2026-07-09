import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit, RateLimit } from '@stynx-nyx/backend';
import { Idempotent } from '@stynx-nyx/idempotency';
import { FlowRuntimeService } from '../flow-runtime.service';
import type { FlowTaskActionDto, FlowTaskAssignmentDto, FlowTaskNoteDto } from '../types';

@Controller('/flow/tasks')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowTasksController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.runtime.listTasks(query);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.runtime.getTask(id);
  }

  @Permission('flow:assign:task')
  @ReadOnly()
  @Get('/:id/candidates')
  candidates(@Param('id') id: string) {
    return this.runtime.taskCandidates(id);
  }

  @Permission('flow:assign:task')
  @ReadOnly()
  @Get('/roles/:role/users')
  usersByRole(@Param('role') role: string, @Query('search') search?: string) {
    return this.runtime.listUsersForRole(role, search);
  }

  @Permission('flow:assign:task')
  @ReadOnly()
  @Get('/users/:id')
  user(@Param('id') id: string) {
    return this.runtime.getTaskUser(id);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.task.act', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @RateLimit({ bucket: 'user', scope: 'flow.task.act' })
  @Post('/:id/act')
  act(@Param('id') id: string, @Body() input: FlowTaskActionDto) {
    return this.runtime.actTask(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.task.accept', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/accept')
  accept(@Param('id') id: string, @Body() input: FlowTaskNoteDto) {
    return this.runtime.acceptTask(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.task.decline', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/decline')
  decline(@Param('id') id: string, @Body() input: FlowTaskNoteDto) {
    return this.runtime.declineTask(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.task.unaccept', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/unaccept')
  unaccept(@Param('id') id: string, @Body() input: FlowTaskNoteDto) {
    return this.runtime.unacceptTask(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.task.withdraw', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/withdraw')
  withdraw(@Param('id') id: string, @Body() input: FlowTaskNoteDto) {
    return this.runtime.withdrawTask(id, input);
  }

  @Permission('flow:assign:task')
  @Audit({ action: 'flow.task.assign', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/assign')
  assign(@Param('id') id: string, @Body() input: FlowTaskAssignmentDto) {
    return this.runtime.assignTask(id, input);
  }

  @Permission('flow:assign:task')
  @Audit({ action: 'flow.task.unassign', entity: 'flow.tasks' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/unassign')
  unassign(@Param('id') id: string, @Body() input: FlowTaskNoteDto) {
    return this.runtime.unassignTask(id, input);
  }
}
