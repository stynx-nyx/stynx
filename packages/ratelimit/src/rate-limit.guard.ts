import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_SYSTEM_ROUTE } from '@stynx-nyx/auth';
import { headerToString } from '@stynx-nyx/contracts';
import { Inject, Optional } from '@nestjs/common';
import { STYNX_RATE_LIMIT_METRICS, STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_POLICY, STYNX_RATE_LIMIT_ROUTE, STYNX_RATE_LIMIT_STORE } from './constants.js';
import type { RequestLike } from './request-context.js';
import type {
  RateLimitDecisionContext,
  RateLimitGuardOptions,
  RateLimitMetricsSink,
  RateLimitPolicyResolver,
  RateLimitStore,
} from './types.js';

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
    const payload: unknown = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    // Native JSON.parse without a reviver produces data properties. Null alone
    // reaches the original caught property error; other JSON primitives have no claims.
    if (payload === null) return null;
    if (typeof payload !== 'object') return {};
    const sub: unknown = Reflect.get(payload, 'sub');
    const tenantId: unknown = Reflect.get(payload, 'tenant_id');
    return {
      ...(typeof sub === 'string' ? { sub } : {}),
      ...(typeof tenantId === 'string' ? { tenantId } : {}),
    };
  } catch {
    return null;
  }
}

function toTenantId(request: RequestLike): string | undefined {
  return request.tenantId ?? request.stynxClaims?.tenantId ?? parseStynxAccessToken(request.headers.authorization)?.tenantId;
}

function responseLike(request: RequestLike): { setHeader: unknown } | null {
  const candidate = request.res ?? request.response;
  if (candidate === null || candidate === undefined || !readRuntimeProperty(candidate, 'setHeader')) {
    return null;
  }
  const method = readRuntimeProperty(candidate, 'setHeader');
  const bind = readRuntimeProperty(method, 'bind');
  if (typeof bind !== 'function') throw new TypeError('Rate limit header bind is not callable');
  const setHeader: unknown = Reflect.apply(bind, method, [candidate]);
  return { setHeader };
}

function setResponseHeader(method: unknown, response: { setHeader: unknown }, name: string, value: string): void {
  if (typeof method !== 'function') throw new TypeError('Rate limit header setter is not callable');
  Reflect.apply(method, response, [name, value]);
}

function readRuntimeProperty(value: unknown, key: PropertyKey): unknown {
  if (value === null || value === undefined) {
    throw new TypeError('Cannot read a nullish rate limit value');
  }
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    return Reflect.get(target, key, value);
  }
  throw new TypeError('Invalid rate limit property receiver');
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
    setResponseHeader(response.setHeader, response, 'X-RateLimit-Limit', String(decision.limit));
    setResponseHeader(response.setHeader, response, 'X-RateLimit-Remaining', String(decision.remaining));
    setResponseHeader(response.setHeader, response, 'X-RateLimit-Reset', String(Math.ceil(decision.resetAtEpochMs / 1000)));
    if (!decision.allowed) {
      setResponseHeader(response.setHeader, response, 'Retry-After', String(decision.retryAfterSeconds));
    }
  }

  private applyOverheadHeader(request: RequestLike, durationMs: number): void {
    const response = responseLike(request);
    if (!response) {
      return;
    }
    setResponseHeader(response.setHeader, response, 'X-Stynx-RateLimit-Overhead-Ms', durationMs.toFixed(3));
  }
}
