import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PolicyEvaluator } from '@stynx/contracts';
import { getPrincipalFromRequest, type RequestLike } from '../common/request-context';
import { DefaultPolicyEvaluator } from './default-policy-evaluator';
import { STYNX_AUTHZ_METADATA, STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';
import type { AuthzMetadata } from './decorators';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly evaluator: PolicyEvaluator;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(STYNX_AUTHZ_POLICY_EVALUATOR)
    evaluator?: PolicyEvaluator,
  ) {
    this.evaluator = evaluator ?? new DefaultPolicyEvaluator();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<AuthzMetadata | undefined>(
      STYNX_AUTHZ_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const principal = getPrincipalFromRequest(request);
    if (!principal) {
      throw new ForbiddenException('Missing request principal for authorization evaluation');
    }

    const allowed = await this.evaluator.evaluate({
      principal,
      requirements: {
        ...(metadata.roles ? { roles: metadata.roles } : {}),
        ...(metadata.permissions ? { permissions: metadata.permissions } : {}),
      },
      action: context.getHandler().name,
      resource: context.getClass().name,
    });

    if (!allowed) {
      throw new ForbiddenException('Access denied by policy evaluator');
    }

    return true;
  }
}
