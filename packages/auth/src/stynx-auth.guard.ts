import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import {
  InvalidCredentialError,
  STYNX_BUILTIN_AUTH_GUARD,
  STYNX_PUBLIC_TENANT_ROUTE,
  STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL,
  STYNX_VERIFIED_TENANT_ID,
  type PublicTenantRouteOptions,
} from '@stynx-nyx/contracts';
import { SessionRevocationList } from '@stynx-nyx/sessions';
import { StynxJwtValidator } from './stynx-jwt.validator.js';
import { STYNX_PUBLIC_ROUTE, STYNX_READONLY_ROUTE, STYNX_SYSTEM_ROUTE } from './decorators.js';
import type { RequestLike, StynxAccessTokenClaims } from './types.js';
import { headerToString } from './utils.js';
import { clearVerifiedPrincipal, markVerifiedPrincipal } from './verified-principal.js';

function responseLike(
  request: RequestLike,
): { setHeader(name: string, value: string): void } | null {
  const candidate = (request.res ?? request.response) as
    { setHeader?: (name: string, value: string) => void } | undefined;
  if (!candidate?.setHeader) {
    return null;
  }
  return {
    setHeader: candidate.setHeader.bind(candidate),
  };
}

/** Verified-token claims after the guard's completeness checks. */
interface AuthorizedClaims extends StynxAccessTokenClaims {
  permissions: string[];
  roles: string[];
  expiresAt: number;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

/**
 * Authenticates STYNX bearer tokens and derives the request principal from the
 * verified token alone (S-12, D-025, D-059 P-7-05).
 *
 * On the request path the guard verifies the JWT (signature, issuer, audience,
 * `exp`/`nbf`), requires the `sub`, `sid`, `tenant_id`, `exp`, `perms` and
 * `roles` claims, and checks the session id against the in-memory
 * {@link SessionRevocationList}. It reads no session record, permission cache,
 * Redis key or SQL row. Revocation is the short access-token TTL plus that list,
 * which a background job refreshes from the session store off the request path.
 */
@Injectable()
export class StynxAuthGuard implements CanActivate {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly reflector: Reflector,
    private readonly validator: StynxJwtValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    Reflect.deleteProperty(request, STYNX_VERIFIED_TENANT_ID);
    const publicTenant = this.reflector.getAllAndOverride<PublicTenantRouteOptions | boolean>(
      STYNX_PUBLIC_TENANT_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (publicTenant !== undefined && publicTenant !== false) {
      clearVerifiedPrincipal(request);
      Reflect.deleteProperty(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL);
      delete request.stynxClaims;
      delete request.principal;
      delete request.user;
      delete request.actor;
      delete request.tenantId;
      delete (request as RequestLike & { verifiedSessionId?: string }).verifiedSessionId;
      delete (request as RequestLike & { verifiedTenantClaim?: string }).verifiedTenantClaim;
      delete (request as RequestLike & { verifiedTenantEntitlement?: unknown })
        .verifiedTenantEntitlement;
      delete (request as RequestLike & { principalContext?: unknown }).principalContext;
      (
        request as RequestLike & { publicTenantRoute: boolean; publicTenantOptionalAuth: boolean }
      ).publicTenantRoute = true;
      (request as RequestLike & { publicTenantOptionalAuth: boolean }).publicTenantOptionalAuth =
        publicTenant === true ? false : Boolean(publicTenant.optionalAuth);
      request.stynxReadonly = Boolean(
        this.reflector.getAllAndOverride<boolean>(STYNX_READONLY_ROUTE, [
          context.getHandler(),
          context.getClass(),
        ]),
      );
      if (!publicTenant || publicTenant === true || !publicTenant.optionalAuth) return true;
      const authorization = headerToString(request.headers.authorization);
      const token = authorization?.match(/^Bearer +(\S+)$/u)?.[1];
      if (!token) return true;
      let claims: Awaited<ReturnType<StynxJwtValidator['validate']>>;
      try {
        claims = await this.validator.validate(token);
      } catch (error) {
        if (error instanceof InvalidCredentialError) return true;
        throw error;
      }
      const authorized = this.requireAuthorizedClaims(claims, 'Token verification returned malformed claims');
      if (this.isRevoked(authorized.sid)) return true;
      request.stynxClaims = authorized;
      request.principal = {
        id: authorized.sub,
        roles: [...authorized.roles],
        permissions: [...authorized.permissions],
        tenants: [authorized.tenantId],
        claims: authorized.claims,
      };
      request.user = {
        id: authorized.sub,
        roles: [...authorized.roles],
        permissions: [...authorized.permissions],
        tenants: [authorized.tenantId],
        claims: authorized.claims,
      };
      request.actor = request.user;
      markVerifiedPrincipal(request);
      Reflect.set(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(STYNX_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(STYNX_SYSTEM_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    delete request.stynxClaims;
    const response = responseLike(request);
    const startedAt = performance.now();
    const authorization = headerToString(request.headers.authorization);
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing STYNX bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    let claims: Awaited<ReturnType<StynxJwtValidator['validate']>>;
    try {
      claims = await this.validator.validate(token);
    } catch (error) {
      if (error instanceof InvalidCredentialError) {
        throw new UnauthorizedException('Invalid STYNX bearer token');
      }
      throw error;
    }
    const authorized = this.requireAuthorizedClaims(claims, 'STYNX bearer token lacks required claims');
    if (this.isRevoked(authorized.sid)) {
      throw new UnauthorizedException('STYNX session is no longer active');
    }

    request.stynxClaims = authorized;
    request.tenantId = authorized.tenantId;
    request.stynxReadonly = Boolean(
      this.reflector.getAllAndOverride<boolean>(STYNX_READONLY_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    request.principal = {
      id: authorized.sub,
      roles: [...authorized.roles],
      permissions: [...authorized.permissions],
      tenants: [authorized.tenantId],
      claims: authorized.claims,
    };
    request.user = {
      id: authorized.sub,
      roles: [...authorized.roles],
      permissions: [...authorized.permissions],
      tenants: [authorized.tenantId],
      claims: authorized.claims,
    };
    request.actor = request.user;
    markVerifiedPrincipal(request);
    Reflect.set(request, STYNX_VERIFIED_TENANT_ID, authorized.tenantId);
    response?.setHeader('X-Stynx-Auth-Verify-Ms', (performance.now() - startedAt).toFixed(3));
    return true;
  }

  /**
   * Requires every claim authorization depends on. A token without `perms` and
   * `roles` (for example one minted before S-12) is refused, not looked up.
   */
  private requireAuthorizedClaims(
    claims: StynxAccessTokenClaims | null | undefined,
    message: string,
  ): AuthorizedClaims {
    if (
      !claims ||
      !nonEmptyString(claims.sub) ||
      !nonEmptyString(claims.sid) ||
      !nonEmptyString(claims.tenantId) ||
      typeof claims.expiresAt !== 'number' ||
      !Number.isFinite(claims.expiresAt) ||
      !stringList(claims.permissions) ||
      !stringList(claims.roles)
    ) {
      throw new UnauthorizedException(message);
    }
    if (claims.expiresAt * 1000 <= Date.now()) {
      throw new UnauthorizedException('STYNX bearer token has expired');
    }
    return claims as AuthorizedClaims;
  }

  /**
   * Synchronous, in-memory revocation check. Fails closed when the list has not
   * been refreshed from the session store within its staleness bound.
   */
  private isRevoked(sid: string): boolean {
    const revocations = this.revocationList();
    if (!revocations) return false;
    if (revocations.isStale()) {
      throw new ServiceUnavailableException('STYNX session revocation list is stale');
    }
    return revocations.isRevoked(sid);
  }

  private revocationList(): SessionRevocationList | undefined {
    try {
      return this.moduleRef.get(SessionRevocationList, { strict: false }) ?? undefined;
    } catch {
      return undefined;
    }
  }
}

Object.defineProperty(StynxAuthGuard, STYNX_BUILTIN_AUTH_GUARD, { value: true });
