import { BadRequestException, Injectable, NestMiddleware, Optional } from '@nestjs/common';
import type { RequestLike } from '../common/request-context';
import type { ResponseLike } from './request-db-client-lifecycle';

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
    const request = requestLike as RequestLike & Record<PropertyKey, unknown>;
    const response = responseLike as ResponseLike | undefined;
    const tenantId = this.readTenantId(request);

    if (!tenantId && this.options.requireTenantHeader) {
      throw new BadRequestException(`${this.options.tenantHeaderName} header is required`);
    }
    if (tenantId && this.options.enforceTenantUuid && !TENANT_ID_UUID_PATTERN.test(tenantId)) {
      throw new BadRequestException(`${this.options.tenantHeaderName} must be a UUID`);
    }
    if (tenantId) {
      request.tenantId = tenantId;
    }

    this.bindReleaseHandlers(request, response);
    next();
  }

  private readTenantId(request: RequestLike): string | undefined {
    const headers = request.headers ?? {};
    const direct = firstHeaderValue(headers[this.options.tenantHeaderName]);
    if (direct && direct.trim().length > 0) {
      return direct.trim();
    }
    const lower = this.options.tenantHeaderName.toLowerCase();
    const lowerValue = firstHeaderValue(headers[lower]);
    if (lowerValue && lowerValue.trim().length > 0) {
      return lowerValue.trim();
    }
    return undefined;
  }

  private bindReleaseHandlers(
    request: RequestLike & Record<PropertyKey, unknown>,
    response?: ResponseLike,
  ): void {
    if (!response || typeof response.once !== 'function') {
      return;
    }

    const release = () => {
      void this.releaseClient(request);
    };
    for (const event of this.options.releaseEvents) {
      response.once(event, release);
    }
  }

  private async releaseClient(request: RequestLike & Record<PropertyKey, unknown>): Promise<void> {
    if (request[RELEASED_FLAG]) {
      return;
    }

    let client: unknown;
    for (const key of this.options.requestClientKeys) {
      const candidate = request[key];
      if (candidate) {
        client = candidate;
        break;
      }
    }
    if (!client) {
      return;
    }

    request[RELEASED_FLAG] = true;
    const withRelease = client as Record<string, unknown>;
    const release = withRelease[this.options.releaseMethodName];
    if (typeof release === 'function') {
      await (release as () => Promise<void> | void).call(client);
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
