import type { Principal } from './auth';

export type RequirementMatchMode = 'all' | 'any';

export interface RoleRequirement {
  roles: string[];
  mode?: RequirementMatchMode;
}

export interface PermissionRequirement {
  permissions: string[];
  mode?: RequirementMatchMode;
}

export interface AuthorizationRequirements {
  roles?: RoleRequirement;
  permissions?: PermissionRequirement;
}

export interface PolicyEvaluationContext {
  principal: Principal;
  requirements: AuthorizationRequirements;
  resource?: string;
  action?: string;
}

export interface PolicyEvaluator {
  evaluate(context: PolicyEvaluationContext): Promise<boolean> | boolean;
}
