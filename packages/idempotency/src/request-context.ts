export interface RequestLike {
  headers: Record<string, unknown>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  body?: unknown;
  tenantId?: string;
  user?: { id?: string } | undefined;
  actor?: { id?: string } | undefined;
  principal?: { id?: string } | undefined;
}
