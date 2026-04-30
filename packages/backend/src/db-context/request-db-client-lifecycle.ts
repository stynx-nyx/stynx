import type { RequestLike } from '../common/request-context';

export interface RequestDbClientAcquireContext {
  request: RequestLike;
  tenantId: string;
}

export interface RequestDbClientReleaseContext {
  request: RequestLike;
  tenantId: string;
  client: unknown;
}

export interface RequestDbClientLifecycle {
  acquire(context: RequestDbClientAcquireContext): Promise<unknown> | unknown;
  release(context: RequestDbClientReleaseContext): Promise<void> | void;
}

export interface ResponseLike {
  once(event: 'finish' | 'close', listener: () => void): unknown;
  finished?: boolean;
  writableEnded?: boolean;
}

export interface TenantBoundDbClientFactory {
  connectWithTenant(tenantId: string): Promise<unknown>;
}

export interface PgTenantDbClientLifecycleOptions {
  releaseMethodName?: string;
}

/**
 * Convenience lifecycle matching PEC's `connectWithTenant(...)` + `client.release()`.
 */
export class PgTenantDbClientLifecycle implements RequestDbClientLifecycle {
  private readonly releaseMethodName: string;

  constructor(
    private readonly factory: TenantBoundDbClientFactory,
    options: PgTenantDbClientLifecycleOptions = {},
  ) {
    this.releaseMethodName = options.releaseMethodName ?? 'release';
  }

  async acquire(context: RequestDbClientAcquireContext): Promise<unknown> {
    return this.factory.connectWithTenant(context.tenantId);
  }

  async release(context: RequestDbClientReleaseContext): Promise<void> {
    const candidate = context.client as Record<string, unknown>;
    const release = candidate[this.releaseMethodName];
    if (typeof release === 'function') {
      await (release as () => Promise<void> | void).call(context.client);
    }
  }
}

export interface ResponseEventRequestDbClientLifecycleOptions {
  responseResolver?: (request: RequestLike) => ResponseLike | undefined;
  releaseEvents?: ReadonlyArray<'finish' | 'close'>;
}

const RELEASED_BY_RESPONSE_EVENT = Symbol('STYNX_RELEASED_BY_RESPONSE_EVENT');

/**
 * Wraps another lifecycle and defers release to HTTP response `finish/close`
 * events when a response object is available. This matches stacks that depend
 * on middleware-style response completion semantics.
 */
export class ResponseEventRequestDbClientLifecycle implements RequestDbClientLifecycle {
  private readonly responseResolver: (request: RequestLike) => ResponseLike | undefined;
  private readonly releaseEvents: ReadonlyArray<'finish' | 'close'>;

  constructor(
    private readonly delegate: RequestDbClientLifecycle,
    options: ResponseEventRequestDbClientLifecycleOptions = {},
  ) {
    this.responseResolver = options.responseResolver ?? defaultResponseResolver;
    this.releaseEvents = options.releaseEvents ?? ['finish', 'close'];
  }

  async acquire(context: RequestDbClientAcquireContext): Promise<unknown> {
    return this.delegate.acquire(context);
  }

  async release(context: RequestDbClientReleaseContext): Promise<void> {
    const requestState = context.request as unknown as Record<PropertyKey, unknown>;
    if (requestState[RELEASED_BY_RESPONSE_EVENT]) {
      return;
    }

    const response = this.responseResolver(context.request);
    if (!response) {
      await this.releaseNow(context, requestState);
      return;
    }

    if (response.finished || response.writableEnded) {
      await this.releaseNow(context, requestState);
      return;
    }

    const release = () => {
      void this.releaseNow(context, requestState);
    };
    for (const event of this.releaseEvents) {
      response.once(event, release);
    }
  }

  private async releaseNow(
    context: RequestDbClientReleaseContext,
    requestState: Record<PropertyKey, unknown>,
  ): Promise<void> {
    if (requestState[RELEASED_BY_RESPONSE_EVENT]) {
      return;
    }
    requestState[RELEASED_BY_RESPONSE_EVENT] = true;
    await this.delegate.release(context);
  }
}

function defaultResponseResolver(request: RequestLike): ResponseLike | undefined {
  const direct = request.response as ResponseLike | undefined;
  if (direct && typeof direct.once === 'function') {
    return direct;
  }
  const nested = request.res as ResponseLike | undefined;
  if (nested && typeof nested.once === 'function') {
    return nested;
  }
  return undefined;
}
