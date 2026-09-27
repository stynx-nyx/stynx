import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthorizationGuard } from './authorization.guard';
import { DefaultPolicyEvaluator } from './default-policy-evaluator';
import { STYNX_AUTHZ_OPTIONS, STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';
import type { StynxAuthorizationModuleOptions } from './authorization.types';

export type { AuthorizationTarget, StynxAuthorizationModuleOptions } from './authorization.types';

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
