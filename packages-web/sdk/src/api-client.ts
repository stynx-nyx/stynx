import type { ApiRequestOptions, FetchLike, HttpRequestInitLike, HttpResponseLike } from './http';
import { FrontendSessionManager } from './session-manager';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

export interface StynxApiClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;
  sessionManager?: FrontendSessionManager;
  tenantResolver?: () => string | null;
  defaultHeaders?: Record<string, string>;
}

const trimEdgeSlash = (value: string): string => value.replace(/\/+$/, '');
const trimStartSlash = (value: string): string => value.replace(/^\/+/, '');

const buildQuery = (query?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params.set(key, String(value));
  });
  const raw = params.toString();
  return raw.length > 0 ? `?${raw}` : '';
};

const hasHeader = (headers: Record<string, string>, key: string): boolean => {
  return Object.keys(headers).some((name) => name.toLowerCase() === key.toLowerCase());
};

const isJsonResponse = (response: HttpResponseLike): boolean => {
  const contentType = response.headers?.get('content-type');
  return typeof contentType === 'string' && contentType.toLowerCase().includes('application/json');
};

export class StynxApiClient {
  private readonly baseUrl: string;

  constructor(private readonly options: StynxApiClientOptions) {
    this.baseUrl = trimEdgeSlash(options.baseUrl);
  }

  get<T>(path: string, requestOptions?: ApiRequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, requestOptions);
  }

  post<T>(path: string, body: unknown, requestOptions?: ApiRequestOptions): Promise<T> {
    return this.request<T>('POST', path, body, requestOptions);
  }

  delete<T>(path: string, requestOptions?: ApiRequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, requestOptions);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const query = buildQuery(requestOptions.query);
    const url = `${this.baseUrl}/${trimStartSlash(path)}${query}`;

    const headers: Record<string, string> = {
      ...(this.options.defaultHeaders ?? {}),
      ...(requestOptions.headers ?? {}),
    };

    const token = this.options.sessionManager?.getValidAccessToken();
    if (token && !hasHeader(headers, 'authorization')) {
      headers.Authorization = `Bearer ${token}`;
    }

    const resolvedTenantId = requestOptions.tenantId ?? this.options.tenantResolver?.() ?? null;
    if (resolvedTenantId && !hasHeader(headers, 'x-tenant-id')) {
      headers['x-tenant-id'] = resolvedTenantId;
    }

    const init: HttpRequestInitLike = { method, headers, signal: requestOptions.signal };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      if (!hasHeader(headers, 'content-type')) {
        headers['content-type'] = 'application/json';
      }
    }

    const response = await this.options.fetchFn(url, init);
    const responseText = await response.text();

    if (!response.ok) {
      throw new ApiClientError(`Request failed (${response.status})`, response.status, responseText);
    }

    if (responseText.length === 0) {
      return undefined as T;
    }

    return (isJsonResponse(response) ? JSON.parse(responseText) : responseText) as T;
  }
}
