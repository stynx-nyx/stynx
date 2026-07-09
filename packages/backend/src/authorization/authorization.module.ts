import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { PolicyEvaluator } from '@stynx-nyx/contracts';
import { AuthorizationGuard } from './authorization.guard';
import { STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';

export interface StynxAuthorizationModuleOptions {
  policyEvaluator?: PolicyEvaluator;
}

@Module({})
export class StynxAuthorizationModule {
  static forRoot(options: StynxAuthorizationModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [AuthorizationGuard];
    if (options.policyEvaluator) {
      providers.push({
        provide: STYNX_AUTHZ_POLICY_EVALUATOR,
        useValue: options.policyEvaluator,
      });
    }

    return {
      module: StynxAuthorizationModule,
      providers,
      exports: providers,
    };
  }
}
