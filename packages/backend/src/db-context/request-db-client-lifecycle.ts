import type { RequestLike } from '../common/request-context.js';

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
    const release = readProperty(context.client, this.releaseMethodName);
    if (typeof release === 'function') {
      const result: unknown = Reflect.apply(release, context.client, []);
      await result;
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
    const requestState = context.request;
    if (!isPropertyRecord(requestState)) {
      throw new TypeError('Request lifecycle state requires an object');
    }
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
  const direct = request.response;
  if (direct && typeof readProperty(direct, 'once') === 'function') {
    return responseAdapter(direct);
  }
  const nested = request.res;
  if (nested && typeof readProperty(nested, 'once') === 'function') {
    return responseAdapter(nested);
  }
  return undefined;
}

function isPropertyRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function readProperty(value: unknown, key: PropertyKey): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${String(value)} (reading '${String(key)}')`);
  }
  const boxed: unknown = Object(value);
  if (!isPropertyRecord(boxed)) {
    throw new TypeError('Lifecycle property receiver could not be boxed');
  }
  return Reflect.get(boxed, key, value);
}

function responseAdapter(response: unknown): ResponseLike {
  return {
    get finished() {
      return Boolean(readProperty(response, 'finished'));
    },
    get writableEnded() {
      return Boolean(readProperty(response, 'writableEnded'));
    },
    once(event, listener): unknown {
      const once = readProperty(response, 'once');
      if (typeof once !== 'function') {
        throw new TypeError('Response once is not a function');
      }
      const result: unknown = Reflect.apply(once, response, [event, listener]);
      return result;
    },
  };
}
