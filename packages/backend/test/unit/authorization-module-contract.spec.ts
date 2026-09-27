import { APP_GUARD } from '@nestjs/core';
import { STYNX_AUTHZ_POLICY_EVALUATOR, StynxAuthorizationModule } from '../../src';
import { DefaultPolicyEvaluator } from '../../src/authorization/default-policy-evaluator';
import { AuthorizationGuard } from '../../src/authorization/authorization.guard';

describe('StynxAuthorizationModule contract', () => {
  it('always binds and exports the default policy evaluator token', () => {
    const configured = StynxAuthorizationModule.forRoot();
    const provider = configured.providers?.find((item) => typeof item === 'object' && 'provide' in item && item.provide === STYNX_AUTHZ_POLICY_EVALUATOR);
    expect(provider).toMatchObject({ provide: STYNX_AUTHZ_POLICY_EVALUATOR });
    if (provider && typeof provider === 'object' && 'useClass' in provider) {
      expect(provider.useClass).toBe(DefaultPolicyEvaluator);
    } else if (provider && typeof provider === 'object' && 'useValue' in provider) {
      expect(provider.useValue).toBeInstanceOf(DefaultPolicyEvaluator);
    } else {
      throw new Error('Expected the default evaluator provider to select DefaultPolicyEvaluator');
    }
    expect(configured.exports).toContain(STYNX_AUTHZ_POLICY_EVALUATOR);
  });

  it('uses the configured evaluator through the injectable token', () => {
    const evaluator = { evaluate: vi.fn(() => true) };
    const configured = StynxAuthorizationModule.forRoot({ policyEvaluator: evaluator });
    expect(configured.providers).toContainEqual({ provide: STYNX_AUTHZ_POLICY_EVALUATOR, useValue: evaluator });
    expect(configured.exports).toContain(STYNX_AUTHZ_POLICY_EVALUATOR);
  });

  it('registers the existing guard as a global guard only when requested', () => {
    const local = StynxAuthorizationModule.forRoot();
    expect(local.providers).not.toContainEqual(expect.objectContaining({ provide: APP_GUARD }));
    const global = StynxAuthorizationModule.forRoot({ global: true } as never);
    expect(global.providers).toContainEqual({ provide: APP_GUARD, useExisting: AuthorizationGuard });
    expect(global.providers).toContain(AuthorizationGuard);
  });
});
