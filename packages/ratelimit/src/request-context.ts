export interface RequestLike {
  headers: Record<string, unknown>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  body?: unknown;
  ip?: string;
  tenantId?: string;
  stynxClaims?: { sub?: string; tenantId?: string } | undefined;
  user?: { id?: string } | undefined;
  actor?: { id?: string } | undefined;
  principal?: { id?: string } | undefined;
  res?: unknown;
  response?: unknown;
}
