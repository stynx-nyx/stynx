import type { Principal, RequestPrincipalContext } from '@stynx/contracts';

export interface RequestLike {
  headers: Record<string, unknown>;
  method?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  body?: unknown;
  ip?: string;
  res?: unknown;
  response?: unknown;
  user?: unknown;
  actor?: unknown;
  principal?: Principal;
  principalContext?: RequestPrincipalContext;
  tenantId?: string;
  correlationId?: string;
  requestId?: string;
  pgClient?: unknown;
  dbClient?: unknown;
}

export function getPrincipalFromRequest(request: RequestLike): Principal | undefined {
  const direct = request.principal;
  if (direct) return direct;

  const fromContext = request.principalContext?.principal;
  if (fromContext) return fromContext;

  const user = request.user as Partial<Principal> | undefined;
  if (user?.id) {
    return {
      id: user.id,
      roles: Array.isArray(user.roles) ? user.roles : [],
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      tenants: Array.isArray(user.tenants) ? user.tenants : [],
      claims: (user.claims as Record<string, unknown>) ?? {},
      ...(typeof user.email === 'string' ? { email: user.email } : {}),
      ...(typeof user.username === 'string' ? { username: user.username } : {}),
    };
  }

  const actor = request.actor as Partial<Principal> | undefined;
  if (actor?.id) {
    return {
      id: actor.id,
      roles: Array.isArray(actor.roles) ? actor.roles : [],
      permissions: Array.isArray(actor.permissions) ? actor.permissions : [],
      tenants: Array.isArray(actor.tenants) ? actor.tenants : [],
      claims: (actor.claims as Record<string, unknown>) ?? {},
      ...(typeof actor.email === 'string' ? { email: actor.email } : {}),
      ...(typeof actor.username === 'string' ? { username: actor.username } : {}),
    };
  }

  return undefined;
}
