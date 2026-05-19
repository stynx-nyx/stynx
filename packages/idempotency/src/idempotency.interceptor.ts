import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  Inject,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, from, type Observable } from 'rxjs';
import { createHash, randomUUID } from 'node:crypto';
import { STYNX_IDEMPOTENCY_BACKEND, STYNX_IDEMPOTENCY_METRICS, STYNX_IDEMPOTENCY_OPTIONS, STYNX_IDEMPOTENCY_STORE, STYNX_IDEMPOTENT_ROUTE, STYNX_NO_IDEMPOTENT_ROUTE } from './constants';
import type { RequestLike } from './request-context';
import type {
  IdempotencyBackend,
  IdempotencyDecisionContext,
  IdempotentMetadata,
  IdempotencyInterceptorOptions,
  IdempotencyMetricsSink,
  IdempotencyStore,
  IdempotencyStoredEntry,
} from './types';

interface CachedResponse {
  body: unknown;
  statusCode: number;
  expiresAt: number;
  requestFingerprint: string;
  headers: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<
  Pick<
    IdempotencyInterceptorOptions,
    | 'defaultHeaderName'
    | 'replayKeyHeaderName'
    | 'replayMarkerHeaderName'
    | 'ttlMs'
    | 'durableStrict'
    | 'waitAttempts'
    | 'waitIntervalMs'
  >
> = {
  defaultHeaderName: 'Idempotency-Key',
  replayKeyHeaderName: 'X-Idempotency-Key',
  replayMarkerHeaderName: 'Idempotency-Replayed',
  ttlMs: 24 * 60 * 60 * 1000,
  durableStrict: false,
  waitAttempts: 12,
  waitIntervalMs: 50,
};

interface HttpResponseLike {
  statusCode?: number;
  setHeader(name: string, value: string): void;
  status(statusCode: number): unknown;
}

function setLookupTimingHeader(response: HttpResponseLike, durationMs: number): void {
  response.setHeader('X-Stynx-Idempotency-Lookup-Ms', durationMs.toFixed(3));
}

function headerToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function normalizeMethod(method: unknown): string {
  return typeof method === 'string' ? method.toUpperCase() : '';
}

function toUserId(request: RequestLike): string | undefined {
  return request.principal?.id ?? request.actor?.id ?? request.user?.id;
}

function toPath(request: RequestLike): string {
  const withOriginal = request as RequestLike & { originalUrl?: string };
  const withUrl = request as RequestLike & { url?: string };
  const raw = withOriginal.originalUrl ?? withUrl.url ?? '';
  return raw.split('?')[0]!;
}

function toBody(request: RequestLike): unknown {
  return (request as RequestLike & { body?: unknown }).body;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly options: typeof DEFAULT_OPTIONS;

  constructor(
    private readonly reflector: Reflector,
    @Inject(STYNX_IDEMPOTENCY_OPTIONS)
    options: IdempotencyInterceptorOptions = {},
    @Optional()
    @Inject(STYNX_IDEMPOTENCY_STORE)
    private readonly durableStore?: IdempotencyStore,
    @Optional()
    @Inject(STYNX_IDEMPOTENCY_BACKEND)
    private readonly backend?: IdempotencyBackend,
    @Optional()
    @Inject(STYNX_IDEMPOTENCY_METRICS)
    private readonly metrics?: IdempotencyMetricsSink,
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (this.reflector.getAllAndOverride<boolean>(STYNX_NO_IDEMPOTENT_ROUTE, [context.getHandler(), context.getClass()])) {
      return next.handle();
    }
    const metadata = this.reflector.getAllAndOverride<IdempotentMetadata | undefined>(STYNX_IDEMPOTENT_ROUTE, [context.getHandler(), context.getClass()]);
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const headerName = metadata.headerName ?? this.options.defaultHeaderName;
    const idempotencyKey = this.getIdempotencyKey(request, headerName);
    if (!idempotencyKey) {
      throw new BadRequestException(`${headerName} header is required for idempotent routes`);
    }

    const decisionContext = this.buildDecisionContext(
      request,
      headerName,
      idempotencyKey,
      metadata.ttlMs ?? this.options.ttlMs,
    );
    const response = context.switchToHttp().getResponse<HttpResponseLike>();
    return from(this.run(context, next, response, decisionContext));
  }

  private getIdempotencyKey(request: RequestLike, headerName: string): string | undefined {
    const direct = request.headers[headerName];
    const canonical = request.headers[headerName.toLowerCase()];
    const raw = direct ?? canonical;
    const value = headerToString(raw)?.trim();
    return value && value.length > 0 ? value : undefined;
  }

  private requestFingerprint(request: RequestLike): string {
    const method = normalizeMethod((request as RequestLike & { method?: string }).method);
    const path = toPath(request);
    const body = this.stableStringify(toBody(request));
    return createHash('sha256').update(`${method}:${path}:${body}`).digest('hex');
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

  private assertFingerprintMatches(
    entry: Pick<CachedResponse, 'requestFingerprint'>,
    fingerprint: string,
  ): void {
    if (entry.requestFingerprint !== fingerprint) {
      throw new UnprocessableEntityException(
        'IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY',
      );
    }
  }

  private applyReplayHeaders(
    response: HttpResponseLike,
    headerValue: string,
    statusCode: number,
    headers: Record<string, string> = {},
  ): void {
    response.status(statusCode);
    response.setHeader(this.options.replayKeyHeaderName, headerValue);
    response.setHeader(this.options.replayMarkerHeaderName, 'true');
    for (const [key, value] of Object.entries(headers)) {
      response.setHeader(key, value);
    }
  }

  private async toCachedFromStored(
    entry: IdempotencyStoredEntry,
  ): Promise<CachedResponse> {
    return {
      body: entry.body,
      statusCode: entry.statusCode ?? 200,
      expiresAt: entry.expiresAt,
      requestFingerprint: entry.requestFingerprint,
      headers: entry.headers,
    };
  }

  private buildDecisionContext(
    request: RequestLike,
    headerName: string,
    headerValue: string,
    ttlMs: number,
  ): IdempotencyDecisionContext {
    const method = normalizeMethod((request as RequestLike & { method?: string }).method);
    const routeKey = `${method}:${toPath(request)}`;
    const tenantId = request.tenantId;
    const userId = toUserId(request);
    const compositeKey = createHash('sha256')
      .update(JSON.stringify({
        tenantId: tenantId ?? null,
        userId: userId ?? null,
        routeKey,
        headerValue,
      }))
      .digest('hex');
    return {
      request,
      compositeKey,
      headerName,
      headerValue,
      requestFingerprint: this.requestFingerprint(request),
      routeKey,
      ttlMs,
      ...(tenantId ? { tenantId } : {}),
      ...(userId ? { userId } : {}),
    };
  }

  private async run(
    context: ExecutionContext,
    next: CallHandler,
    response: HttpResponseLike,
    decisionContext: IdempotencyDecisionContext,
  ): Promise<unknown> {
    const lookupStartedAt = performance.now();
    const backendHit = await this.backend?.get(decisionContext);
    if (backendHit) {
      this.assertFingerprintMatches(backendHit, decisionContext.requestFingerprint);
      if (backendHit.status === 'completed') {
        this.metrics?.incrementReplay();
        setLookupTimingHeader(response, performance.now() - lookupStartedAt);
        this.applyReplayHeaders(response, decisionContext.headerValue, backendHit.statusCode ?? 200, backendHit.headers);
        return backendHit.body;
      }
    }

    const durableHit = await this.durableStore?.lookup(decisionContext);
    if (durableHit) {
      this.assertFingerprintMatches(durableHit, decisionContext.requestFingerprint);
      if (durableHit.status === 'completed') {
        this.metrics?.incrementReplay();
        await this.backend?.set(decisionContext, durableHit);
        setLookupTimingHeader(response, performance.now() - lookupStartedAt);
        this.applyReplayHeaders(response, decisionContext.headerValue, durableHit.statusCode ?? 200, durableHit.headers);
        return durableHit.body;
      }
    }

    const lockToken = randomUUID();
    const lockAcquired = await this.backend?.acquireLock(decisionContext, lockToken);
    if (!lockAcquired) {
      const waited = await this.waitForReadyEntry(decisionContext);
      if (waited) {
        this.metrics?.incrementReplay();
        setLookupTimingHeader(response, performance.now() - lookupStartedAt);
        this.applyReplayHeaders(response, decisionContext.headerValue, waited.statusCode, waited.headers);
        return waited.body;
      }
      if (this.options.durableStrict) {
        throw new ServiceUnavailableException('Unable to establish durable idempotency ownership');
      }
    } else {
      const reserved = await this.durableStore?.reserve(decisionContext);
      if (reserved === false && this.options.durableStrict) {
        await this.backend?.releaseLock(decisionContext, lockToken);
        throw new ServiceUnavailableException('Unable to reserve durable idempotency entry');
      }
    }

    setLookupTimingHeader(response, performance.now() - lookupStartedAt);

    try {
      const body = await firstValueFrom(next.handle());
      const statusCode = response.statusCode ?? 200;
      const headers = this.captureReplayableHeaders(response);
      const entry: IdempotencyStoredEntry = {
        requestFingerprint: decisionContext.requestFingerprint,
        statusCode,
        body,
        headers,
        expiresAt: Date.now() + decisionContext.ttlMs,
        status: 'completed',
      };
      if (statusCode < 500) {
        await this.backend?.set(decisionContext, entry);
        await this.durableStore?.persistResponse(decisionContext, statusCode, body, headers);
      } else {
        await this.durableStore?.clearReservation(decisionContext);
      }
      return body;
    } catch (error) {
      if (error instanceof HttpException) {
        const statusCode = error.getStatus();
        if (statusCode < 500) {
          const body = error.getResponse();
          const headers = this.captureReplayableHeaders(response);
          const entry: IdempotencyStoredEntry = {
            requestFingerprint: decisionContext.requestFingerprint,
            statusCode,
            body,
            headers,
            expiresAt: Date.now() + decisionContext.ttlMs,
            status: 'completed',
          };
          await this.backend?.set(decisionContext, entry);
          await this.durableStore?.persistResponse(decisionContext, statusCode, body, headers);
        } else {
          await this.durableStore?.clearReservation(decisionContext);
        }
      } else {
        await this.durableStore?.clearReservation(decisionContext);
      }
      throw error;
      /* v8 ignore next 4 -- success, observable errors, sync throws, and lock/no-lock paths exercise this cleanup; V8 reports the finally edge as a synthetic branch. */
    } finally {
      if (lockAcquired) {
        await this.backend?.releaseLock(decisionContext, lockToken);
      }
    }
  }

  private async waitForReadyEntry(
    context: IdempotencyDecisionContext,
  ): Promise<CachedResponse | null> {
    for (let i = 0; i < this.options.waitAttempts; i += 1) {
      const cached = await this.backend?.get(context);
      if (cached) {
        this.assertFingerprintMatches(cached, context.requestFingerprint);
        if (cached.status === 'completed') {
          return this.toCachedFromStored(cached);
        }
      }
      const entry = await this.durableStore?.lookup(context);
      if (entry) {
        this.assertFingerprintMatches(entry, context.requestFingerprint);
        if (entry.status === 'completed') {
          return this.toCachedFromStored(entry);
        }
      }
      const locked = await this.backend?.isLocked(context);
      if (!locked) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, this.options.waitIntervalMs));
    }
    return null;
  }

  private captureReplayableHeaders(response: HttpResponseLike): Record<string, string> {
    const headers = (response as { headers?: Record<string, string> }).headers;
    if (headers && typeof headers === 'object') {
      return { ...headers };
    }
    return {};
  }
}
