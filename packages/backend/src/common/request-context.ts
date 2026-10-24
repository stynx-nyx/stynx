import type { Principal, RequestPrincipalContext } from '@stynx-nyx/contracts';

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
  verifiedSessionId?: string;
  verifiedTenantEntitlement?: (tenantId: string) => Promise<boolean> | boolean;
  correlationId?: string;
  requestId?: string;
  pgClient?: unknown;
  dbClient?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || typeof value[index] !== 'string') return false;
  }
  return true;
}

export function getPrincipalFromRequest(request: RequestLike): Principal | undefined {
  const direct = request.principal;
  if (direct) return direct;

  const fromContext = request.principalContext?.principal;
  if (fromContext) return fromContext;

  const candidateKeys: readonly ['user', 'actor'] = ['user', 'actor'];
  for (const key of candidateKeys) {
    const candidate = request[key];
    if (candidate === null || typeof candidate !== 'object' || !('id' in candidate)) continue;
    const id = candidate.id;
    if (!id) continue;
    if (!isRecord(candidate) || typeof id !== 'string') return undefined;
    const selected: Record<string, unknown> = candidate;

    const roles: unknown = Array.isArray(selected.roles) ? selected.roles : [];
    const permissions: unknown = Array.isArray(selected.permissions) ? selected.permissions : [];
    const tenants: unknown = Array.isArray(selected.tenants) ? selected.tenants : [];
    const claims = selected.claims ?? {};
    if (!isStringArray(roles) || !isStringArray(permissions) || !isStringArray(tenants) ||
        !isRecord(claims)) return undefined;
    return {
      id,
      roles,
      permissions,
      tenants,
      claims,
      ...(typeof selected.email === 'string' ? { email: selected.email } : {}),
      ...(typeof selected.username === 'string' ? { username: selected.username } : {}),
    };
  }

  return undefined;
}
