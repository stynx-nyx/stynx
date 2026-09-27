import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PolicyEvaluator } from '@stynx-nyx/contracts';
import { getPrincipalFromRequest, type RequestLike } from '../common/request-context';
import { DefaultPolicyEvaluator } from './default-policy-evaluator';
import { STYNX_AUTHZ_METADATA, STYNX_AUTHZ_OPTIONS, STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';
import type { AuthzMetadata } from './decorators';
import type { AuthorizationTarget, StynxAuthorizationModuleOptions } from './authorization.module';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly evaluator: PolicyEvaluator;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(STYNX_AUTHZ_POLICY_EVALUATOR)
    evaluator?: PolicyEvaluator,
    @Optional() @Inject(STYNX_AUTHZ_OPTIONS)
    private readonly options: StynxAuthorizationModuleOptions = {},
  ) {
    this.evaluator = evaluator ?? new DefaultPolicyEvaluator();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.options.publicMetadataKey && this.reflector.getAllAndOverride<boolean>(
      this.options.publicMetadataKey,
      [context.getHandler(), context.getClass()],
    )) return true;

    const metadata = this.reflector.getAllAndOverride<AuthzMetadata | undefined>(
      STYNX_AUTHZ_METADATA,
      [context.getHandler(), context.getClass()],
    );

    const resolved = this.options.resolveTarget?.(context);
    const hasTarget = Boolean(resolved && (
      (typeof resolved.resource === 'string' && resolved.resource.length > 0)
      || (typeof resolved.action === 'string' && resolved.action.length > 0)
    ));
    if (!metadata && !hasTarget) {
      return true;
    }

    const target: AuthorizationTarget = hasTarget ? resolved! : metadata
      ? { resource: context.getClass().name, action: context.getHandler().name }
      : {};

    const request = context.switchToHttp().getRequest<RequestLike>();
    const principal = getPrincipalFromRequest(request);
    if (!principal) {
      throw this.options.onDeny?.(context, target, undefined)
        ?? new ForbiddenException('Missing request principal for authorization evaluation');
    }

    const allowed = await this.evaluator.evaluate({
      principal,
      requirements: {
        ...(metadata?.roles ? { roles: metadata.roles } : {}),
        ...(metadata?.permissions ? { permissions: metadata.permissions } : {}),
      },
      ...target,
      ...(request.tenantId ? { tenantId: request.tenantId } : {}),
    });

    if (!allowed) {
      throw this.options.onDeny?.(context, target, principal)
        ?? new ForbiddenException('Access denied by policy evaluator');
    }

    return true;
  }
}
