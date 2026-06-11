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
} from '@stynx/contracts';
import { headerToString } from '@stynx/contracts';
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
  ) {
    this.mapper = principalMapper ?? new DefaultPrincipalMapper();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const result = await this.tokenVerifier.verifyAuthorizationHeader(
      request.headers['authorization'] as string | string[] | undefined,
    );

    if (!result?.principal) {
      throw new UnauthorizedException('Token verification returned no principal');
    }

    const principal = this.mapper.map(result);
    request.principal = principal;
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
      if (this.tenantEntitlementPolicy) {
        const entitled = await this.tenantEntitlementPolicy.isEntitled({
          principal,
          tenantId,
        });
        if (!entitled) {
          throw new ForbiddenException('Principal is not entitled for tenant context');
        }
      }
      request.tenantId = tenantId;
      request.principalContext = {
        ...request.principalContext,
        tenantId,
      };
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
      });
      if (resolved) return resolved;
    }

    if (explicitHeader) return explicitHeader;
    if (principalTenants.length === 1) return principalTenants[0];
    return undefined;
  }
}
