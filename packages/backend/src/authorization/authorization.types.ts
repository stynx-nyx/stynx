import type { ExecutionContext } from '@nestjs/common';
import type { PolicyEvaluator, Principal } from '@stynx-nyx/contracts';

export interface AuthorizationTarget {
  resource?: string;
  action?: string;
}

export interface StynxAuthorizationModuleOptions {
  policyEvaluator?: PolicyEvaluator;
  global?: boolean;
  resolveTarget?: (ctx: ExecutionContext) => AuthorizationTarget | undefined;
  publicMetadataKey?: string | symbol;
  onDeny?: (ctx: ExecutionContext, target: AuthorizationTarget, principal: Principal | undefined) => Error;
}
