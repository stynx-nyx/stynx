import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  PrincipalMapper,
  TenantEntitlementPolicy,
  TenantResolver,
  TokenVerifier,
} from '@stynx-nyx/contracts';
import { headerToString } from '@stynx-nyx/contracts';
import { InvalidCredentialError, STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, STYNX_VERIFIED_TENANT_ID, hasPublicTenantRoute, type PublicTenantRouteOptions } from '@stynx-nyx/contracts';
import { ModulesContainer, Reflector, ModuleRef } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_OPTIONS } from '@stynx-nyx/contracts';
import { DefaultPrincipalMapper } from './default-principal-mapper';
import {
  STYNX_PRINCIPAL_MAPPER,
  STYNX_TENANT_ENTITLEMENT_POLICY,
  STYNX_TENANT_RESOLVER,
  STYNX_TOKEN_VERIFIER,
} from './constants';
import type { RequestLike } from '../common/request-context';

@Injectable()
export class AuthContextGuard implements CanActivate {
  private readonly mapper: PrincipalMapper;

  constructor(
    @Inject(STYNX_TOKEN_VERIFIER)
    private readonly tokenVerifier: TokenVerifier,
    @Optional() @Inject(STYNX_PRINCIPAL_MAPPER)
    principalMapper?: PrincipalMapper,
    @Optional() @Inject(STYNX_TENANT_RESOLVER)
    private readonly tenantResolver?: TenantResolver,
    @Optional() @Inject(STYNX_TENANT_ENTITLEMENT_POLICY)
    private readonly tenantEntitlementPolicy?: TenantEntitlementPolicy,
    @Optional() private readonly reflector?: Reflector,
    @Optional() private readonly modules?: ModulesContainer,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    this.mapper = principalMapper ?? new DefaultPrincipalMapper();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    Reflect.deleteProperty(request, STYNX_VERIFIED_TENANT_ID);
    const targets = [context.getHandler?.(), context.getClass?.()].filter((target) => typeof target === 'function') as Array<(...args: unknown[]) => unknown>;
    const publicTenant = this.reflector?.getAllAndOverride<PublicTenantRouteOptions | boolean>(STYNX_PUBLIC_TENANT_ROUTE, targets)
      ?? targets.map((target) => Reflect.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, target)).find((value) => value !== undefined);
    if (publicTenant !== undefined && publicTenant !== false) {
      Reflect.deleteProperty(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL);
      delete (request as RequestLike & { stynxClaims?: unknown }).stynxClaims;
      delete request.principal;
      delete request.principalContext;
      delete request.user;
      delete request.actor;
      delete request.tenantId;
      delete request.verifiedSessionId;
      delete request.verifiedTenantEntitlement;
      delete (request as RequestLike & { verifiedTenantClaim?: string }).verifiedTenantClaim;
      (request as RequestLike & { publicTenantRoute: boolean; publicTenantOptionalAuth: boolean }).publicTenantRoute = true;
      (request as RequestLike & { publicTenantOptionalAuth: boolean }).publicTenantOptionalAuth = publicTenant === true ? false : Boolean(publicTenant.optionalAuth);
      if (!publicTenant || publicTenant === true || !publicTenant.optionalAuth) return true;
      const authorization = headerToString(request.headers['authorization']);
      if (!authorization?.match(/^Bearer +\S+$/u)) return true;
      let result: Awaited<ReturnType<TokenVerifier['verifyAuthorizationHeader']>>;
      try {
        result = await this.tokenVerifier.verifyAuthorizationHeader(authorization);
      } catch (error) {
        if (error instanceof InvalidCredentialError) return true;
        throw error;
      }
      if (result === null) return true;
      if (!result?.principal || typeof result.principal.id !== 'string' || !result.principal.id) {
        throw new UnauthorizedException('Token verification returned no principal');
      }
      const principal = this.mapper.map(result);
      if (!principal || typeof principal.id !== 'string' || !principal.id || !Array.isArray(principal.tenants)) {
        throw new UnauthorizedException('Token verification returned no principal');
      }
      request.principal = principal;
      const verifiedSessionId = principal.claims?.sid;
      if (typeof verifiedSessionId === 'string') request.verifiedSessionId = verifiedSessionId;
      if (this.tenantEntitlementPolicy) {
        request.verifiedTenantEntitlement = (tenantId: string) => this.tenantEntitlementPolicy!.isEntitled({ principal, tenantId });
      }
      const tenantClaim = [principal.claims?.tenant_id, principal.claims?.tenantId, principal.claims?.['custom:tenant_id'], principal.claims?.['https://stynx.dev/tenant']]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        ?? (() => {
          const tenants = [...new Set(principal.tenants.map((value) => value.trim().toLowerCase()).filter(Boolean))];
          return tenants.length === 1 ? tenants[0] : undefined;
        })();
      if (typeof tenantClaim === 'string') {
        (request as RequestLike & { verifiedTenantClaim?: string }).verifiedTenantClaim = tenantClaim;
      }
      request.user = { id: principal.id, roles: principal.roles, permissions: principal.permissions, tenants: principal.tenants, claims: principal.claims };
      request.actor = request.user;
      Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
      return true;
    }
    const result = await this.tokenVerifier.verifyAuthorizationHeader(
      request.headers['authorization'] as string | string[] | undefined,
    );

    if (!result?.principal) {
      throw new UnauthorizedException('Token verification returned no principal');
    }

    const principal = this.mapper.map(result);
    request.principal = principal;
    const verifiedSessionId = principal.claims?.sid;
    if (typeof verifiedSessionId === 'string') request.verifiedSessionId = verifiedSessionId;
    request.principalContext = {
      principal,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    };

    // Compatibility attachment to support existing consumer styles in porm/pec/sgp.
    request.user = {
      id: principal.id,
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      tenants: principal.tenants,
      claims: principal.claims,
      email: principal.email,
      username: principal.username,
      ...(principal.claims ?? {}),
    };
    request.actor = {
      id: principal.id,
      sub: principal.id,
      roles: principal.roles,
      permissions: principal.permissions,
      groups: principal.roles,
      claims: principal.claims,
      username: principal.username,
    };

    const tenantId = await this.resolveTenant(request, principal.tenants);
    if (tenantId) {
      let verified = principal.tenants.includes(tenantId);
      if (this.tenantEntitlementPolicy) {
        const entitled = await this.tenantEntitlementPolicy.isEntitled({
          principal,
          tenantId,
        });
        if (!entitled) {
          throw new ForbiddenException('Principal is not entitled for tenant context');
        }
        verified = true;
      }
      request.tenantId = tenantId;
      request.principalContext = {
        ...request.principalContext,
        tenantId,
      };
      if (verified) Reflect.set(request, STYNX_VERIFIED_TENANT_ID, tenantId);
    }

    return true;
  }

  private async resolveTenant(
    request: RequestLike,
    principalTenants: string[],
  ): Promise<string | undefined> {
    const explicitHeader = headerToString(request.headers['x-tenant-id'])?.trim();
    if (this.tenantResolver) {
      const resolved = await this.tenantResolver.resolve({
        principal: request.principal!,
        ...(explicitHeader ? { headerTenantId: explicitHeader } : {}),
        ...(typeof request.headers.host === 'string' ? { host: request.headers.host } : {}),
        ...((request.originalUrl ?? request.url) ? { path: (request.originalUrl ?? request.url ?? '/').split('?')[0] || '/' } : {}),
      });
      if (resolved) return resolved;
    }

    if (explicitHeader) return explicitHeader;
    if (principalTenants.length === 1) return principalTenants[0];
    return undefined;
  }

  onApplicationBootstrap(): void {
    if (!this.modules || !this.moduleRef) return;
    for (const module of this.modules.values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        if (hasPublicTenantRoute(controller)) {
          let options: unknown;
          try { options = this.moduleRef.get(STYNX_PUBLIC_TENANT_OPTIONS, { strict: false }); } catch { /* absent provider */ }
          if (!options) throw new Error('PublicTenantRoute requires StynxTenancyModule publicTenant options');
        }
      }
    }
  }
}
