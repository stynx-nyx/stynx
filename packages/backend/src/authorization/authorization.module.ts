import { DynamicModule, ExecutionContext, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { PolicyEvaluator, Principal } from '@stynx-nyx/contracts';
import { AuthorizationGuard } from './authorization.guard';
import { DefaultPolicyEvaluator } from './default-policy-evaluator';
import { STYNX_AUTHZ_OPTIONS, STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';

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

@Module({})
export class StynxAuthorizationModule {
  static forRoot(options: StynxAuthorizationModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      AuthorizationGuard,
      { provide: STYNX_AUTHZ_OPTIONS, useValue: options },
      options.policyEvaluator
        ? { provide: STYNX_AUTHZ_POLICY_EVALUATOR, useValue: options.policyEvaluator }
        : { provide: STYNX_AUTHZ_POLICY_EVALUATOR, useClass: DefaultPolicyEvaluator },
    ];
    if (options.global) providers.push({ provide: APP_GUARD, useExisting: AuthorizationGuard });

    return {
      module: StynxAuthorizationModule,
      providers,
      exports: [AuthorizationGuard, STYNX_AUTHZ_POLICY_EVALUATOR],
    };
  }
}
