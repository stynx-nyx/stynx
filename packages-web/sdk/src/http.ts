export interface ApiRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  tenantId?: string | null;
  signal?: unknown;
}

export interface HttpRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: unknown;
}

export interface HttpHeadersLike {
  get(name: string): string | null | undefined;
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  headers?: HttpHeadersLike;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: HttpRequestInitLike) => Promise<HttpResponseLike>;
