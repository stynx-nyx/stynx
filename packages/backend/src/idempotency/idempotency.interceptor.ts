import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom, from, Observable, of } from 'rxjs';
import type { RequestLike } from '../common/request-context';
import type {
  IdempotencyDecisionContext,
  IdempotencyInterceptorOptions,
  IdempotencyStore,
  IdempotencyStoredEntry,
} from './types';

interface CachedResponse {
  body: unknown;
  statusCode: number;
  expiresAt: number;
  requestFingerprint: string;
}

const DEFAULT_OPTIONS: Required<
  Pick<
    IdempotencyInterceptorOptions,
    | 'keyHeaderName'
    | 'replayKeyHeaderName'
    | 'replayMarkerHeaderName'
    | 'writeMethods'
    | 'ttlMs'
    | 'cacheCleanupMs'
    | 'durableStrict'
    | 'waitAttempts'
    | 'waitIntervalMs'
  >
> & {
  requireKeyOnWrite: NonNullable<IdempotencyInterceptorOptions['requireKeyOnWrite']>;
} = {
  keyHeaderName: 'x-idempotency-key',
  replayKeyHeaderName: 'X-Idempotency-Key',
  replayMarkerHeaderName: 'X-Idempotency-Replay',
  writeMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  ttlMs: 24 * 60 * 60 * 1000,
  cacheCleanupMs: 30 * 60 * 1000,
  requireKeyOnWrite: true,
  durableStrict: false,
  waitAttempts: 12,
  waitIntervalMs: 50,
};

interface HttpResponseLike {
  statusCode?: number;
  setHeader(name: string, value: string): void;
  status(statusCode: number): unknown;
}

function headerToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function normalizeMethod(method: unknown): string {
  return typeof method === 'string' ? method.toUpperCase() : '';
}

function toPath(request: RequestLike): string {
  const withOriginal = request as RequestLike & { originalUrl?: string };
  const withUrl = request as RequestLike & { url?: string };
  const raw = withOriginal.originalUrl ?? withUrl.url ?? '';
  return raw.replace(/\?.*$/u, '');
}

function toBody(request: RequestLike): unknown {
  return (request as RequestLike & { body?: unknown }).body;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly options: typeof DEFAULT_OPTIONS;
  private readonly cache = new Map<string, CachedResponse>();
  private readonly inFlight = new Map<string, Promise<CachedResponse>>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    @Optional() options?: IdempotencyInterceptorOptions,
    @Optional() private readonly durableStore?: IdempotencyStore,
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      requireKeyOnWrite: options?.requireKeyOnWrite ?? DEFAULT_OPTIONS.requireKeyOnWrite,
    };
    this.cleanupInterval = setInterval(() => this.cleanup(), this.options.cacheCleanupMs);
    this.cleanupInterval.unref();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const method = normalizeMethod((request as RequestLike & { method?: string }).method);
    if (!this.options.writeMethods.includes(method)) {
      return next.handle();
    }

    const idempotencyKey = this.getIdempotencyKey(request);
    if (!idempotencyKey) {
      if (this.requiresKey(request)) {
        throw new BadRequestException('X-Idempotency-Key header is required for write operations');
      }
      return next.handle();
    }

    const tenantId = request.tenantId;
    const fingerprint = this.requestFingerprint(request);
    const cacheKey = `${tenantId ?? ''}:${idempotencyKey}`;
    const response = context.switchToHttp().getResponse<HttpResponseLike>();

    if (this.durableStore && tenantId) {
      return this.interceptDurable(
        request,
        response,
        next,
        cacheKey,
        idempotencyKey,
        fingerprint,
        tenantId,
      );
    }

    if (this.options.durableStrict) {
      throw new ServiceUnavailableException(
        'Unable to establish durable idempotency ownership',
      );
    }

    return this.interceptInMemory(response, next, cacheKey, idempotencyKey, fingerprint);
  }

  private requiresKey(request: RequestLike): boolean {
    if (typeof this.options.requireKeyOnWrite === 'function') {
      return this.options.requireKeyOnWrite(request);
    }
    return this.options.requireKeyOnWrite;
  }

  private getIdempotencyKey(request: RequestLike): string | undefined {
    const raw = request.headers[this.options.keyHeaderName];
    const value = headerToString(raw)?.trim();
    return value && value.length > 0 ? value : undefined;
  }

  private requestFingerprint(request: RequestLike): string {
    const method = normalizeMethod((request as RequestLike & { method?: string }).method);
    const path = toPath(request);
    const body = this.stableStringify(toBody(request));
    return `${method}:${path}:${body}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([key, entry]) =>
            `"${key.replace(/"/g, '\\"')}":${this.stableStringify(entry)}`,
        );
      return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private assertFingerprintMatches(
    entry: Pick<CachedResponse, 'requestFingerprint'>,
    fingerprint: string,
  ): void {
    if (entry.requestFingerprint !== fingerprint) {
      throw new ConflictException(
        'X-Idempotency-Key was already used with a different request payload',
      );
    }
  }

  private applyReplayHeaders(
    response: HttpResponseLike,
    idempotencyKey: string,
    statusCode: number,
  ): void {
    response.status(statusCode);
    response.setHeader(this.options.replayKeyHeaderName, idempotencyKey);
    response.setHeader(this.options.replayMarkerHeaderName, 'true');
  }

  private replayCachedResponse(
    response: HttpResponseLike,
    idempotencyKey: string,
    entry: CachedResponse,
  ): Observable<unknown> {
    this.applyReplayHeaders(response, idempotencyKey, entry.statusCode);
    return of(entry.body);
  }

  private resolveLocalReplay(
    response: HttpResponseLike,
    cacheKey: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Observable<unknown> | null {
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.assertFingerprintMatches(cached, fingerprint);
      return this.replayCachedResponse(response, idempotencyKey, cached);
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) {
      return from(
        pending.then((entry) => {
          this.assertFingerprintMatches(entry, fingerprint);
          this.applyReplayHeaders(response, idempotencyKey, entry.statusCode);
          return entry.body;
        }),
      );
    }

    return null;
  }

  private interceptInMemory(
    response: HttpResponseLike,
    next: CallHandler,
    cacheKey: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Observable<unknown> {
    const replay = this.resolveLocalReplay(
      response,
      cacheKey,
      idempotencyKey,
      fingerprint,
    );
    if (replay) {
      return replay;
    }

    const pendingExecution = this.runInMemoryExecution(
      next,
      response,
      cacheKey,
      idempotencyKey,
      fingerprint,
    ).finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, pendingExecution);
    return from(pendingExecution.then((entry) => entry.body));
  }

  private async runInMemoryExecution(
    next: CallHandler,
    response: HttpResponseLike,
    cacheKey: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CachedResponse> {
    const body = await firstValueFrom(next.handle());
    const statusCode = response.statusCode ?? 200;
    response.setHeader(this.options.replayKeyHeaderName, idempotencyKey);
    const entry: CachedResponse = {
      body,
      statusCode,
      expiresAt: Date.now() + this.options.ttlMs,
      requestFingerprint,
    };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  private async toCachedFromStored(
    entry: IdempotencyStoredEntry,
  ): Promise<CachedResponse> {
    return {
      body: entry.body,
      statusCode: entry.statusCode ?? 200,
      expiresAt: entry.expiresAt,
      requestFingerprint: entry.requestFingerprint,
    };
  }

  private buildDecisionContext(
    request: RequestLike,
    idempotencyKey: string,
    requestFingerprint: string,
    tenantId: string,
  ): IdempotencyDecisionContext {
    return {
      request,
      idempotencyKey,
      requestFingerprint,
      ttlMs: this.options.ttlMs,
      tenantId,
    };
  }

  private interceptDurable(
    request: RequestLike,
    response: HttpResponseLike,
    next: CallHandler,
    cacheKey: string,
    idempotencyKey: string,
    fingerprint: string,
    tenantId: string,
  ): Observable<unknown> {
    const replay = this.resolveLocalReplay(
      response,
      cacheKey,
      idempotencyKey,
      fingerprint,
    );
    if (replay) return replay;

    const run = async (): Promise<unknown> => {
      const decisionContext = this.buildDecisionContext(
        request,
        idempotencyKey,
        fingerprint,
        tenantId,
      );
      const existing = await this.durableStore!.lookup(decisionContext);
      if (existing) {
        this.assertFingerprintMatches(
          { requestFingerprint: existing.requestFingerprint },
          fingerprint,
        );
        if (existing.body !== null) {
          this.applyReplayHeaders(response, idempotencyKey, existing.statusCode ?? 200);
          return existing.body;
        }
        const ready = await this.waitForDurableResponse(decisionContext);
        if (ready) {
          this.applyReplayHeaders(response, idempotencyKey, ready.statusCode);
          return ready.body;
        }
        throw new ConflictException('X-Idempotency-Key is already being processed');
      }

      const reserved = await this.durableStore!.reserve(decisionContext);
      if (!reserved) {
        return this.handleDurableReservationRace(
          response,
          next,
          cacheKey,
          decisionContext,
        );
      }

      try {
        const body = await firstValueFrom(next.handle());
        const statusCode = response.statusCode ?? 200;
        response.setHeader(this.options.replayKeyHeaderName, idempotencyKey);
        const persisted = await this.durableStore!.persistResponse(
          decisionContext,
          statusCode,
          body,
        );
        if (!persisted) {
          if (this.options.durableStrict) {
            throw new ServiceUnavailableException(
              'Unable to persist durable idempotency response',
            );
          }
          this.cache.set(cacheKey, {
            body,
            statusCode,
            expiresAt: Date.now() + this.options.ttlMs,
            requestFingerprint: fingerprint,
          });
        }
        return body;
      } catch (error) {
        await this.durableStore!.clearReservation(decisionContext);
        throw error;
      }
    };

    const pending = run()
      .then(async (body) => {
        const statusCode = response.statusCode ?? 200;
        return {
          body,
          statusCode,
          expiresAt: Date.now() + this.options.ttlMs,
          requestFingerprint: fingerprint,
        };
      })
      .finally(() => this.inFlight.delete(cacheKey));
    this.inFlight.set(cacheKey, pending);
    return from(pending.then((entry) => entry.body));
  }

  private async handleDurableReservationRace(
    response: HttpResponseLike,
    next: CallHandler,
    cacheKey: string,
    context: IdempotencyDecisionContext,
  ): Promise<unknown> {
    const retry = await this.durableStore!.lookup(context);
    if (retry) {
      this.assertFingerprintMatches(
        { requestFingerprint: retry.requestFingerprint },
        context.requestFingerprint,
      );
      if (retry.body !== null) {
        this.applyReplayHeaders(
          response,
          context.idempotencyKey,
          retry.statusCode ?? 200,
        );
        return retry.body;
      }
    }

    const ready = await this.waitForDurableResponse(context);
    if (ready) {
      this.applyReplayHeaders(response, context.idempotencyKey, ready.statusCode);
      return ready.body;
    }

    if (this.options.durableStrict) {
      throw new ServiceUnavailableException(
        'Unable to establish durable idempotency ownership',
      );
    }

    const body = await firstValueFrom(next.handle());
    const statusCode = response.statusCode ?? 200;
    response.setHeader(this.options.replayKeyHeaderName, context.idempotencyKey);
    this.cache.set(cacheKey, {
      body,
      statusCode,
      expiresAt: Date.now() + this.options.ttlMs,
      requestFingerprint: context.requestFingerprint,
    });
    return body;
  }

  private async waitForDurableResponse(
    context: IdempotencyDecisionContext,
  ): Promise<CachedResponse | null> {
    for (let i = 0; i < this.options.waitAttempts; i += 1) {
      const entry = await this.durableStore!.lookup(context);
      if (!entry) return null;
      this.assertFingerprintMatches(
        { requestFingerprint: entry.requestFingerprint },
        context.requestFingerprint,
      );
      if (entry.body !== null) {
        return this.toCachedFromStored(entry);
      }
      await new Promise((resolve) => setTimeout(resolve, this.options.waitIntervalMs));
    }
    return null;
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
    this.inFlight.clear();
  }
}
