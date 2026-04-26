import type { AuthProvider } from './auth-provider';
import { createStynxSdkError, UnauthorizedError } from './errors';
import type { ApiRequestOptions, FetchLike, HttpRequestInitLike, HttpResponseLike } from './http';
import type { TenantProvider } from './tenant-provider';

export interface StynxHttpTransportOptions {
  baseUrl: string;
  fetchFn: FetchLike;
  authProvider?: AuthProvider;
  tenantProvider?: TenantProvider;
  defaultHeaders?: Record<string, string>;
}

export interface StynxTransportRequestOptions extends ApiRequestOptions {
  method: string;
  path: string;
  body?: unknown;
}

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimStartSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function buildQuery(query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === key.toLowerCase());
}

function isJsonResponse(response: HttpResponseLike, body: string): boolean {
  const contentType = response.headers?.get('content-type');
  if (typeof contentType === 'string' && contentType.toLowerCase().includes('application/json')) {
    return true;
  }
  const trimmed = body.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function parseBody(response: HttpResponseLike, body: string): unknown {
  if (body.length === 0) {
    return undefined;
  }
  if (!isJsonResponse(response, body)) {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

async function resolveToken(provider?: AuthProvider): Promise<string | null> {
  return provider ? await provider.getAccessToken() : null;
}

async function resolveTenantId(
  tenantProvider?: TenantProvider,
  tenantId?: string | null,
): Promise<string | null> {
  if (tenantId !== undefined) {
    return tenantId;
  }
  return tenantProvider ? await tenantProvider.getTenantId() : null;
}

export class StynxHttpTransport {
  private readonly baseUrl: string;

  constructor(private readonly options: StynxHttpTransportOptions) {
    this.baseUrl = trimEdgeSlash(options.baseUrl);
  }

  async request<T>(request: StynxTransportRequestOptions): Promise<T> {
    return this.execute<T>(request, true);
  }

  private async execute<T>(
    request: StynxTransportRequestOptions,
    allowRefresh: boolean,
  ): Promise<T> {
    const query = buildQuery(request.query);
    const url = `${this.baseUrl}/${trimStartSlash(request.path)}${query}`;
    const headers: Record<string, string> = {
      ...(this.options.defaultHeaders ?? {}),
      ...(request.headers ?? {}),
    };

    const token = await resolveToken(this.options.authProvider);
    if (token && !hasHeader(headers, 'authorization')) {
      headers.Authorization = `Bearer ${token}`;
    }

    const tenantId = await resolveTenantId(this.options.tenantProvider, request.tenantId);
    if (tenantId && !hasHeader(headers, 'x-tenant-id')) {
      headers['x-tenant-id'] = tenantId;
    }

    const init: HttpRequestInitLike = {
      method: request.method,
      headers,
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    };

    if (request.body !== undefined) {
      init.body = JSON.stringify(request.body);
      if (!hasHeader(headers, 'content-type')) {
        headers['content-type'] = 'application/json';
      }
    }

    const response = await this.options.fetchFn(url, init);
    const rawBody = await response.text();
    const parsedBody = parseBody(response, rawBody);

    if (response.status === 401 && allowRefresh && this.options.authProvider) {
      const refreshed = await this.options.authProvider.refresh();
      if (refreshed) {
        return this.execute<T>(request, false);
      }
      const error = createStynxSdkError(response.status, parsedBody);
      await this.options.authProvider.onAuthFailure?.(error);
      throw error;
    }

    if (!response.ok) {
      const error = createStynxSdkError(response.status, parsedBody);
      if (error instanceof UnauthorizedError && this.options.authProvider && allowRefresh) {
        await this.options.authProvider.onAuthFailure?.(error);
      }
      throw error;
    }

    return parsedBody as T;
  }
}
