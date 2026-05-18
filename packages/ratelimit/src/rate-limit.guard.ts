import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_SYSTEM_ROUTE } from '@stynx/auth';
import { Inject, Optional } from '@nestjs/common';
import { STYNX_RATE_LIMIT_METRICS, STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_POLICY, STYNX_RATE_LIMIT_ROUTE, STYNX_RATE_LIMIT_STORE } from './constants';
import type { RequestLike } from './request-context';
import type {
  RateLimitDecisionContext,
  RateLimitGuardOptions,
  RateLimitMetricsSink,
  RateLimitPolicyResolver,
  RateLimitStore,
} from './types';

function toPath(request: RequestLike): string {
  const withPath = request as RequestLike & { path?: string; originalUrl?: string; url?: string };
  return withPath.path ?? withPath.originalUrl ?? withPath.url ?? '/';
}

function toMethod(request: RequestLike): string {
  const withMethod = request as RequestLike & { method?: string };
  return withMethod.method ?? 'GET';
}

function toUserId(request: RequestLike): string | undefined {
  return request.principal?.id
    ?? request.actor?.id
    ?? request.user?.id
    ?? request.stynxClaims?.sub
    ?? parseStynxAccessToken(request.headers.authorization)?.sub;
}

function headerToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function parseStynxAccessToken(rawAuthorization: unknown): { sub?: string; tenantId?: string } | null {
  const header = headerToString(rawAuthorization);
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
      sub?: unknown;
      tenant_id?: unknown;
    };
    return {
      ...(typeof payload.sub === 'string' ? { sub: payload.sub } : {}),
      ...(typeof payload.tenant_id === 'string' ? { tenantId: payload.tenant_id } : {}),
    };
  } catch {
    return null;
  }
}

function toTenantId(request: RequestLike): string | undefined {
  return request.tenantId ?? request.stynxClaims?.tenantId ?? parseStynxAccessToken(request.headers.authorization)?.tenantId;
}

function responseLike(request: RequestLike): {
  setHeader(name: string, value: string): void;
} | null {
  const candidate = (request.res ?? request.response) as { setHeader?: (name: string, value: string) => void } | undefined;
  if (!candidate?.setHeader) {
    return null;
  }
  return {
    setHeader: candidate.setHeader.bind(candidate),
  };
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly options: Required<Pick<RateLimitGuardOptions, 'distributedStrict' | 'healthCheckPathPrefixes'>>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(STYNX_RATE_LIMIT_OPTIONS)
    options: RateLimitGuardOptions = {},
    @Optional()
    @Inject(STYNX_RATE_LIMIT_STORE)
    private readonly store?: RateLimitStore,
    @Optional()
    @Inject(STYNX_RATE_LIMIT_POLICY)
    private readonly policyResolver?: RateLimitPolicyResolver,
    @Optional()
    @Inject(STYNX_RATE_LIMIT_METRICS)
    private readonly metrics?: RateLimitMetricsSink,
  ) {
    this.options = {
      distributedStrict: options.distributedStrict ?? false,
      healthCheckPathPrefixes: options.healthCheckPathPrefixes ?? ['/api/v1/system/health'],
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (this.reflector.getAllAndOverride<boolean>(STYNX_SYSTEM_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    if (this.isHealthCheckRequest(request)) {
      return true;
    }

    const metadata = this.reflector.getAllAndOverride<{ bucket: 'ip' | 'tenant' | 'user' | 'route'; scope: string; cost?: number; limit?: number; windowSeconds?: number }>(
      STYNX_RATE_LIMIT_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata || !this.policyResolver) {
      return true;
    }

    const resolved = await this.policyResolver.resolve(request, metadata);
    const decisionContext = this.buildDecisionContext(request, resolved);
    const decisionStartedAt = performance.now();
    const decision = await this.tryConsumeDistributed(decisionContext);
    const decisionDurationMs = performance.now() - decisionStartedAt;
    this.metrics?.recordLatency?.(resolved.scope, decisionDurationMs);
    if (!decision) {
      if (this.options.distributedStrict) {
        throw new ServiceUnavailableException('Distributed rate limit backend unavailable');
      }
      return true;
    }

    this.applyHeaders(request, decision);
    this.applyOverheadHeader(request, decisionDurationMs);
    if (!decision.allowed) {
      this.metrics?.incrementBlocked(resolved.scope);
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private isHealthCheckRequest(request: RequestLike): boolean {
    const path = toPath(request);
    return this.options.healthCheckPathPrefixes.some((prefix) => path.startsWith(prefix));
  }

  private buildDecisionContext(
    request: RequestLike,
    resolved: { bucket: 'ip' | 'tenant' | 'user' | 'route'; scope: string; cost: number; limit: number; windowSeconds: number },
  ): RateLimitDecisionContext {
    const method = toMethod(request);
    const path = toPath(request);
    const tenantId = toTenantId(request);
    const userId = toUserId(request);
    return {
      request,
      bucketKey: this.bucketKey(resolved.bucket, resolved.scope, request, method, path, tenantId, userId),
      ttlMs: resolved.windowSeconds * 1000,
      scope: resolved.scope,
      cost: resolved.cost,
      limit: resolved.limit,
      bucket: resolved.bucket,
      ...(tenantId ? { tenantId } : {}),
      ...(userId ? { userId } : {}),
    };
  }

  private bucketKey(
    bucket: 'ip' | 'tenant' | 'user' | 'route',
    scope: string,
    request: RequestLike,
    method: string,
    path: string,
    tenantId?: string,
    userId?: string,
  ): string {
    if (bucket === 'ip') {
      return `${scope}:ip:${request.ip ?? 'unknown'}`;
    }
    if (bucket === 'tenant') {
      return `${scope}:tenant:${tenantId ?? 'public'}`;
    }
    if (bucket === 'user') {
      return `${scope}:user:${userId ?? 'anonymous'}`;
    }
    return `${scope}:route:${tenantId ?? 'public'}:${method}:${path}`;
  }

  private async tryConsumeDistributed(
    context: RateLimitDecisionContext,
  ) {
    if (!this.store) {
      return null;
    }
    try {
      return await this.store.consume(context);
    } catch (error) {
      if (error instanceof HttpException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      return null;
    }
  }

  private applyHeaders(
    request: RequestLike,
    decision: { limit: number; remaining: number; resetAtEpochMs: number; retryAfterSeconds: number; allowed: boolean },
  ): void {
    const response = responseLike(request);
    if (!response) {
      return;
    }
    response.setHeader('X-RateLimit-Limit', String(decision.limit));
    response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    response.setHeader('X-RateLimit-Reset', String(Math.ceil(decision.resetAtEpochMs / 1000)));
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
    }
  }

  private applyOverheadHeader(request: RequestLike, durationMs: number): void {
    const response = responseLike(request);
    if (!response) {
      return;
    }
    response.setHeader('X-Stynx-RateLimit-Overhead-Ms', durationMs.toFixed(3));
  }
}
