import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RequestLike } from '../common/request-context';
import type { RateLimitDecisionContext, RateLimitGuardOptions, RateLimitStore } from './types';

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_OPTIONS: Required<RateLimitGuardOptions> = {
  limit: 120,
  ttlSeconds: 60,
  distributedStrict: false,
  healthCheckPathPrefixes: ['/api/v1/system/health'],
  maxBuckets: 10000,
  cleanupEvery: 100,
};

function toPath(request: RequestLike): string {
  const withPath = request as RequestLike & { path?: string; originalUrl?: string; url?: string };
  return withPath.path ?? withPath.originalUrl ?? withPath.url ?? '/';
}

function toMethod(request: RequestLike): string {
  const withMethod = request as RequestLike & { method?: string };
  return withMethod.method ?? 'GET';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly options: Required<RateLimitGuardOptions>;
  private readonly ttlMs: number;
  private readonly buckets = new Map<string, Bucket>();
  private callsSinceStoreCleanup = 0;
  private callsSinceInMemoryCleanup = 0;

  constructor(
    @Optional() options?: RateLimitGuardOptions,
    @Optional() private readonly store?: RateLimitStore,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
    this.ttlMs = this.options.ttlSeconds * 1000;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (this.isHealthCheckRequest(request)) {
      return true;
    }

    const decisionContext = this.buildDecisionContext(request);
    const distributedDecision = await this.tryConsumeDistributed(decisionContext);
    if (distributedDecision !== null) {
      return distributedDecision;
    }

    if (this.options.distributedStrict) {
      throw new ServiceUnavailableException('Distributed rate limit backend unavailable');
    }
    return this.consumeInMemory(decisionContext);
  }

  private isHealthCheckRequest(request: RequestLike): boolean {
    const path = toPath(request);
    return this.options.healthCheckPathPrefixes.some((prefix) => path.startsWith(prefix));
  }

  private buildDecisionContext(request: RequestLike): RateLimitDecisionContext {
    const method = toMethod(request);
    const path = toPath(request);
    return {
      request,
      bucketKey: `${request.ip ?? 'unknown'}:${method}:${path}`,
      ttlMs: this.ttlMs,
      ...(request.tenantId ? { tenantId: request.tenantId } : {}),
    };
  }

  private consumeInMemory(context: RateLimitDecisionContext): boolean {
    this.maybeCleanupInMemory();
    const now = Date.now();
    const bucket = this.buckets.get(context.bucketKey);
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(context.bucketKey, {
        count: 1,
        resetAt: now + this.ttlMs,
      });
      return true;
    }
    if (bucket.count >= this.options.limit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.count += 1;
    return true;
  }

  private async tryConsumeDistributed(
    context: RateLimitDecisionContext,
  ): Promise<boolean | null> {
    if (!this.store || !context.tenantId) {
      return null;
    }
    try {
      const hits = await this.store.increment(context);
      if (typeof hits !== 'number') {
        return null;
      }
      if (hits > this.options.limit) {
        throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
      }
      await this.maybeCleanupDistributed(context);
      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return null;
    }
  }

  private async maybeCleanupDistributed(context: RateLimitDecisionContext): Promise<void> {
    this.callsSinceStoreCleanup += 1;
    if (this.callsSinceStoreCleanup < this.options.cleanupEvery) {
      return;
    }
    this.callsSinceStoreCleanup = 0;
    if (!this.store?.cleanup) return;
    try {
      await this.store.cleanup(context);
    } catch {
      return;
    }
  }

  private maybeCleanupInMemory(): void {
    this.callsSinceInMemoryCleanup += 1;
    if (
      this.callsSinceInMemoryCleanup < this.options.cleanupEvery &&
      this.buckets.size <= this.options.maxBuckets
    ) {
      return;
    }
    this.callsSinceInMemoryCleanup = 0;
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt < now) {
        this.buckets.delete(key);
      }
    }

    if (this.buckets.size <= this.options.maxBuckets) {
      return;
    }
    const overflow = this.buckets.size - this.options.maxBuckets;
    const keys = Array.from(this.buckets.keys());
    for (let i = 0; i < overflow; i += 1) {
      const key = keys[i];
      if (key) this.buckets.delete(key);
    }
  }
}
