import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { FlowPolicyService } from '../flow-policy.service';

@Controller('/flow/policies')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowPoliciesController {
  constructor(private readonly policies: FlowPolicyService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/sets')
  listSets(@Query('scopeId') scopeId?: string) {
    return this.policies.listPolicySets(scopeId);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/sets/:id')
  getSet(@Param('id') id: string) {
    return this.policies.getPolicySet(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_set.create', entity: 'flow.policy_sets' })
  @NoIdempotent()
  @Post('/sets')
  createSet(@Body() input: unknown) {
    return this.policies.createPolicySet(input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_set.update', entity: 'flow.policy_sets' })
  @NoIdempotent()
  @Patch('/sets/:id')
  updateSet(@Param('id') id: string, @Body() input: unknown) {
    return this.policies.updatePolicySet(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_set.delete', entity: 'flow.policy_sets' })
  @Delete('/sets/:id')
  deleteSet(@Param('id') id: string) {
    return this.policies.deletePolicySet(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/sets/:policySetId/rules')
  listRules(@Param('policySetId') policySetId: string) {
    return this.policies.listPolicyRules(policySetId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_rule.create', entity: 'flow.policy_rules' })
  @NoIdempotent()
  @Post('/sets/:policySetId/rules')
  createRule(@Param('policySetId') policySetId: string, @Body() input: unknown) {
    return this.policies.createPolicyRule(policySetId, input);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/rules/:id')
  getRule(@Param('id') id: string) {
    return this.policies.getPolicyRule(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_rule.update', entity: 'flow.policy_rules' })
  @NoIdempotent()
  @Patch('/rules/:id')
  updateRule(@Param('id') id: string, @Body() input: unknown) {
    return this.policies.updatePolicyRule(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.policy_rule.delete', entity: 'flow.policy_rules' })
  @Delete('/rules/:id')
  deleteRule(@Param('id') id: string) {
    return this.policies.deletePolicyRule(id);
  }
}
