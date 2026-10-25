import { BadRequestException, Injectable, NestMiddleware, Optional } from '@nestjs/common';

const RELEASED_FLAG = Symbol('STYNX_TENANT_LIFECYCLE_RELEASED');
const TENANT_ID_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_OPTIONS: Required<
  Pick<
    TenantLifecycleMiddlewareOptions,
    | 'tenantHeaderName'
    | 'requireTenantHeader'
    | 'enforceTenantUuid'
    | 'releaseEvents'
    | 'requestClientKeys'
    | 'releaseMethodName'
  >
> = {
  tenantHeaderName: 'x-tenant-id',
  requireTenantHeader: true,
  enforceTenantUuid: true,
  releaseEvents: ['finish', 'close'],
  requestClientKeys: ['pgClient', 'dbClient'],
  releaseMethodName: 'release',
};

export interface TenantLifecycleMiddlewareOptions {
  tenantHeaderName?: string;
  requireTenantHeader?: boolean;
  enforceTenantUuid?: boolean;
  releaseEvents?: ReadonlyArray<'finish' | 'close'>;
  requestClientKeys?: ReadonlyArray<string>;
  releaseMethodName?: string;
}

export interface TenantLifecycleNext {
  (error?: unknown): void;
}

function firstHeaderValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function isPropertyRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function readProperty(value: unknown, key: PropertyKey): unknown {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${String(key)}')`);
  const target: unknown = Object(value);
  if (isPropertyRecord(target)) return Reflect.get(target, key, value);
  throw new TypeError('Property receiver is unavailable');
}

function writeProperty(value: unknown, key: PropertyKey, next: unknown): void {
  if (isPropertyRecord(value)) {
    value[key] = next;
    return;
  }
  const target: unknown = Object(value);
  if (isPropertyRecord(target) && Reflect.set(target, key, next, value)) return;
  throw new TypeError('Cannot write middleware state on a non-object request');
}

@Injectable()
export class TenantLifecycleMiddleware implements NestMiddleware {
  private readonly options: typeof DEFAULT_OPTIONS;

  constructor(@Optional() options?: TenantLifecycleMiddlewareOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...(options ?? {}),
      releaseEvents: options?.releaseEvents ?? DEFAULT_OPTIONS.releaseEvents,
      requestClientKeys: options?.requestClientKeys ?? DEFAULT_OPTIONS.requestClientKeys,
    };
  }

  use(requestLike: unknown, responseLike: unknown, next: TenantLifecycleNext): void {
    const request = requestLike;
    const response = responseLike;
    const tenantId = this.readTenantId(request);

    if (!tenantId && this.options.requireTenantHeader) {
      throw new BadRequestException(`${this.options.tenantHeaderName} header is required`);
    }
    if (tenantId && this.options.enforceTenantUuid && !TENANT_ID_UUID_PATTERN.test(tenantId)) {
      throw new BadRequestException(`${this.options.tenantHeaderName} must be a UUID`);
    }
    if (tenantId) {
      writeProperty(request, 'tenantId', tenantId);
    }

    this.bindReleaseHandlers(request, response);
    next();
  }

  private readTenantId(request: unknown): string | undefined {
    const headers = readProperty(request, 'headers') ?? {};
    const direct = firstHeaderValue(readProperty(headers, this.options.tenantHeaderName));
    if (direct && direct.trim().length > 0) {
      return direct.trim();
    }
    const lower = this.options.tenantHeaderName.toLowerCase();
    const lowerValue = firstHeaderValue(readProperty(headers, lower));
    if (lowerValue && lowerValue.trim().length > 0) {
      return lowerValue.trim();
    }
    return undefined;
  }

  private bindReleaseHandlers(
    request: unknown,
    response?: unknown,
  ): void {
    if (!response || typeof readProperty(response, 'once') !== 'function') {
      return;
    }

    const release = () => {
      void this.releaseClient(request);
    };
    for (const event of this.options.releaseEvents) {
      const once = readProperty(response, 'once');
      if (typeof once !== 'function') throw new TypeError('response.once is not a function');
      Reflect.apply(once, response, [event, release]);
    }
  }

  private async releaseClient(request: unknown): Promise<void> {
    if (readProperty(request, RELEASED_FLAG)) {
      return;
    }

    let client: unknown;
    for (const key of this.options.requestClientKeys) {
      const candidate = readProperty(request, key);
      if (candidate) {
        client = candidate;
        break;
      }
    }
    if (!client) {
      return;
    }

    writeProperty(request, RELEASED_FLAG, true);
    const release = readProperty(client, this.options.releaseMethodName);
    if (typeof release === 'function') {
      const call = readProperty(release, 'call');
      if (typeof call !== 'function') throw new TypeError('release.call is not a function');
      const result: unknown = Reflect.apply(call, release, [client]);
      await result;
    }
  }
}

export function createTenantLifecycleMiddleware(
  options: TenantLifecycleMiddlewareOptions = {},
): (request: unknown, response: unknown, next: TenantLifecycleNext) => void {
  const middleware = new TenantLifecycleMiddleware(options);
  return (request: unknown, response: unknown, next: TenantLifecycleNext) => {
    middleware.use(request, response, next);
  };
}
