import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { STYNX_VERIFIED_TENANT_ID, type PolicyEvaluator } from '@stynx-nyx/contracts';
import { getPrincipalFromRequest, type RequestLike } from '../common/request-context';
import { DefaultPolicyEvaluator } from './default-policy-evaluator';
import { STYNX_AUTHZ_METADATA, STYNX_AUTHZ_OPTIONS, STYNX_AUTHZ_POLICY_EVALUATOR } from './constants';
import type { AuthzMetadata } from './decorators';
import type { AuthorizationTarget, StynxAuthorizationModuleOptions } from './authorization.types';

function optionalProvider<T>(moduleRef: ModuleRef | undefined, token: symbol): T | undefined {
  if (!moduleRef) return undefined;
  try {
    return moduleRef.get<T>(token, { strict: false });
  } catch {
    return undefined;
  }
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly evaluator: PolicyEvaluator;
  private readonly options: StynxAuthorizationModuleOptions;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(STYNX_AUTHZ_POLICY_EVALUATOR)
    evaluator?: PolicyEvaluator,
    @Optional() @Inject(STYNX_AUTHZ_OPTIONS)
    options?: StynxAuthorizationModuleOptions,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    this.evaluator = evaluator
      ?? optionalProvider<PolicyEvaluator>(this.moduleRef, STYNX_AUTHZ_POLICY_EVALUATOR)
      ?? new DefaultPolicyEvaluator();
    this.options = options
      ?? optionalProvider<StynxAuthorizationModuleOptions>(this.moduleRef, STYNX_AUTHZ_OPTIONS)
      ?? {};
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

    const target: AuthorizationTarget = hasTarget ? resolved! : {
      resource: context.getClass().name,
      action: context.getHandler().name,
    };

    const request = context.switchToHttp().getRequest<RequestLike>();
    const principal = getPrincipalFromRequest(request);
    if (!principal) {
      throw this.options.onDeny?.(context, target, undefined)
        ?? new ForbiddenException('Missing request principal for authorization evaluation');
    }

    const verifiedTenantId = Reflect.get(request, STYNX_VERIFIED_TENANT_ID) as unknown;
    const allowed = await this.evaluator.evaluate({
      principal,
      requirements: {
        ...(metadata?.roles ? { roles: metadata.roles } : {}),
        ...(metadata?.permissions ? { permissions: metadata.permissions } : {}),
      },
      ...target,
      ...(typeof verifiedTenantId === 'string' && verifiedTenantId.length > 0
        ? { tenantId: verifiedTenantId }
        : {}),
    });

    if (!allowed) {
      throw this.options.onDeny?.(context, target, principal)
        ?? new ForbiddenException('Access denied by policy evaluator');
    }

    return true;
  }
}
