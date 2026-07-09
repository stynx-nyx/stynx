import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
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
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined;

      void this.resolveAndValidate(request)
        .then(({ tenantId }) => {
          const current = this.requestContext.snapshot();
          const nextState = {
            ...current,
            ...(tenantId !== undefined ? { tenantId } : {}),
          };

          this.requestContextMutator.runWithRequestContext(nextState, () => {
            subscription = next.handle().subscribe({
              next: (value) => subscriber.next(value),
              error: (error: unknown) => subscriber.error(error),
              complete: () => subscriber.complete(),
            });
          });
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => subscription?.unsubscribe();
    });
  }

  private async resolveAndValidate(request: RequestLike): Promise<{ tenantId?: string }> {
    const path = normalizedPath(request);
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
