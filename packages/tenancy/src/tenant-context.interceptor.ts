import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { RequestContext, RequestContextMutator, StynxError } from '@stynx-nyx/core';
import { STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, type PublicTenantRouteOptions } from '@stynx-nyx/contracts';
import { Database } from '@stynx-nyx/data';
import { Observable, type Subscription } from 'rxjs';
import { MembershipAccessCache } from './membership-cache';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANT_MEMBERSHIP_CACHE } from './tokens';
import type { RequestLike, ResolvedStynxTenancyModuleOptions } from './types';
import {
  headerToString,
  isOptionalTenancyPath,
  parseBearerTenantClaims,
  isUuidV7,
  normalizedPath,
  resolveSubdomainTenantId,
} from './utils';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly requestContext: RequestContext,
    private readonly requestContextMutator: RequestContextMutator,
    @Inject(STYNX_TENANT_MEMBERSHIP_CACHE)
    private readonly membershipCache: MembershipAccessCache,
    @Inject(STYNX_TENANCY_OPTIONS)
    private readonly options: ResolvedStynxTenancyModuleOptions,
    @Inject(Reflector) private readonly reflector?: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const marker = this.reflector?.getAllAndOverride<PublicTenantRouteOptions | boolean>(STYNX_PUBLIC_TENANT_ROUTE, [context.getHandler(), context.getClass()])
      ?? (context.getHandler ? Reflect.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, context.getHandler()) : undefined)
      ?? (context.getClass ? Reflect.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, context.getClass()) : undefined);
    if (marker !== undefined && marker !== false) {
      request.publicTenantRoute = true;
      request.publicTenantOptionalAuth = marker === true ? false : Boolean(marker.optionalAuth);
    }
    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined;

      void this.resolveAndValidate(request)
        .then(({ tenantId, actorId, public: publicTenant }) => {
          const verified = publicTenant && request.publicTenantOptionalAuth && Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL) === true;
          const patch = {
            ...(tenantId !== undefined ? { tenantId } : {}),
            ...(actorId !== undefined ? { actorId } : {}),
            ...(publicTenant ? { sessionId: verified ? (request.stynxClaims?.sid ?? request.verifiedSessionId) : undefined } : {}),
          };
          const run = () => {
            subscription = next.handle().subscribe({
              next: (value) => subscriber.next(value),
              error: (error: unknown) => subscriber.error(error),
              complete: () => subscriber.complete(),
            });
          };
          if (this.requestContext.hasActiveContext?.()) {
            this.requestContextMutator.patch(patch as Parameters<RequestContextMutator['patch']>[0]);
            run();
          } else {
            const snapshot = { ...this.requestContext.snapshot() };
            if (publicTenant) delete snapshot.sessionId;
            const { sessionId: nextSessionId, ...contextPatch } = patch;
            this.requestContextMutator.runWithRequestContext({ ...snapshot, ...contextPatch, ...(nextSessionId ? { sessionId: nextSessionId } : {}) }, run);
          }
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => subscription?.unsubscribe();
    });
  }

  private async resolveAndValidate(request: RequestLike): Promise<{ tenantId?: string; actorId?: string; public?: boolean }> {
    const path = normalizedPath(request);
    if (request.publicTenantRoute) {
      const headerName = this.options.headerName.toLowerCase();
      const headerTenantId = headerToString(request.headers[this.options.headerName] ?? request.headers[headerName])?.trim();
      const host = headerToString(request.headers.host);
      const candidate = await this.options.publicTenant?.resolveHost({ ...(host ? { host } : {}), path });
      if (!candidate) throw new BadRequestException(`Tenant context is required: provide ${this.options.headerName}, a tenant bearer claim, or a matching subdomain`);
      if (!isUuidV7(candidate)) throw new BadRequestException('Tenant identifier must be a valid UUIDv7');
      if (headerTenantId && headerTenantId.toLowerCase() !== candidate.toLowerCase()) throw new StynxError(`Tenant source conflict: Host and ${this.options.headerName} disagree`, { status: 400, code: 'TENANCY:CONFLICT:host-header' });
      const verified = request.publicTenantOptionalAuth && Reflect.get(request, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL) === true;
      const verifiedClaim = verified ? request.stynxClaims?.tenantId ?? request.verifiedTenantClaim : undefined;
      if (verifiedClaim && verifiedClaim.trim().toLowerCase() !== candidate.toLowerCase()) throw new StynxError('Tenant source conflict: Host and authenticated claim disagree', { status: 400, code: 'TENANCY:CONFLICT:host-claim' });
      if (!await this.isActiveTenant(candidate)) throw new ForbiddenException('TENANT_ACCESS_DENIED');
      const verifiedActor = verified ? request.stynxClaims?.sub ?? request.principal?.id : undefined;
      if (verifiedActor && !await this.hasActiveMembership(verifiedActor, candidate)) throw new ForbiddenException('TENANT_ACCESS_DENIED');
      if (verifiedActor && request.verifiedTenantEntitlement) {
        try {
          if (!await request.verifiedTenantEntitlement(candidate)) throw new ForbiddenException('Principal is not entitled for tenant context');
        } catch {
          throw new ForbiddenException('Principal is not entitled for tenant context');
        }
      }
      const actorId = verifiedActor ?? this.options.publicTenant?.actorId;
      if (!actorId) throw new Error('PublicTenantRoute requires StynxTenancyModule publicTenant options');
      if (!verified) {
        delete request.stynxClaims;
        delete request.principal;
        delete request.user;
        delete (request as RequestLike & { actor?: unknown }).actor;
        delete (request as RequestLike & { principalContext?: unknown }).principalContext;
        delete request.verifiedSessionId;
        delete request.verifiedTenantClaim;
        delete request.verifiedTenantEntitlement;
      }
      request.tenantId = candidate;
      return { tenantId: candidate, actorId, public: true };
    }
    if (isOptionalTenancyPath(path)) {
      return {};
    }

    const headerName = this.options.headerName.toLowerCase();
    const headerTenantId = headerToString(
      request.headers[this.options.headerName] ?? request.headers[headerName],
    )?.trim();
    const bearerClaims = parseBearerTenantClaims(request.headers.authorization);
    const claimTenantId = request.stynxClaims?.tenantId?.trim() ?? bearerClaims?.tenantId?.trim();
    const subdomainTenantId = this.options.allowSubdomain
      ? resolveSubdomainTenantId(request.headers.host ?? request.host ?? request.hostname, this.options.subdomainPattern)
      : undefined;

    const candidate = headerTenantId ?? claimTenantId ?? subdomainTenantId;
    if (!candidate) {
      throw new BadRequestException(
        `Tenant context is required: provide ${this.options.headerName}, a tenant bearer claim, or a matching subdomain`,
      );
    }

    if (!isUuidV7(candidate)) {
      throw new BadRequestException('Tenant identifier must be a valid UUIDv7');
    }

    if (headerTenantId && claimTenantId && headerTenantId !== claimTenantId) {
      throw new ForbiddenException('TENANT_ACCESS_DENIED');
    }

    const actorId = this.resolveActorId(request);
    if (!actorId) {
      throw new ForbiddenException('TENANT_ACCESS_DENIED');
    }

    const allowed = await this.hasActiveMembership(actorId, candidate);
    if (!allowed) {
      throw new ForbiddenException('TENANT_ACCESS_DENIED');
    }

    request.tenantId = candidate;
    return { tenantId: candidate };
  }

  private async isActiveTenant(tenantId: string): Promise<boolean> {
    const database = this.requireDatabase();
    return database.withSystemContext('public tenant validation', async () =>
      database.tx(async (trx) => {
        const result = await trx.query<{ allowed: boolean }>(
          `select exists (select 1 from tenancy.tenants where id = $1::uuid and is_active = true and coalesce(state, 'active') = 'active') as allowed`,
          [tenantId],
        );
        return result.rows[0]?.allowed === true;
      }, { role: 'owner', readonly: true }));
  }

  private resolveActorId(request: RequestLike): string | undefined {
    return request.stynxClaims?.sub
      ?? parseBearerTenantClaims(request.headers.authorization)?.sub
      ?? request.principal?.id
      ?? request.user?.id;
  }

  private async hasActiveMembership(userId: string, tenantId: string): Promise<boolean> {
    const cached = this.membershipCache.get(userId, tenantId);
    if (cached !== undefined) {
      return cached;
    }

    const database = this.requireDatabase();
    const allowed = await database.withSystemContext(
      'tenant membership validation',
      async () =>
        database.tx(async (trx) => {
          const result = await trx.query<{ allowed: boolean }>(
            `
              select exists (
                select 1
                from auth.memberships membership
                join tenancy.tenants tenant
                  on tenant.id = membership.tenant_id
                where membership.user_id = $1::uuid
                  and membership.tenant_id = $2::uuid
                  and membership.is_active = true
                  and tenant.is_active = true
                  and coalesce(tenant.state, 'active') = 'active'
              ) as allowed
            `,
            [userId, tenantId],
          );
          return result.rows[0]?.allowed === true;
        }, { role: 'owner', readonly: true }),
    );

    this.membershipCache.set(userId, tenantId, allowed);
    return allowed;
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to TenantContextInterceptor');
    }
    return database;
  }
}
