import { validate as uuidValidate, version as uuidVersion } from 'uuid';

export const OPTIONAL_TENANCY_PATHS = [
  /^\/(?:healthz|readyz|metrics|info)$/u,
  /^\/\.well-known\/jwks\.json$/u,
  /^\/sessions(?:\/|$)/u,
  /^\/tenants(?:\/|$)/u,
  /^\/_platform(?:\/|$)/u,
  /^\/_reference\/(?:demo-tenants|dev-login|auth-verify)$/u,
  /^\/_probes\/(?:data-tx|ratelimit|idempotency)$/u,
];

export function headerToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export function parseBearerTenantClaims(rawAuthorization: unknown): { sub?: string; tenantId?: string } | null {
  const header = headerToString(rawAuthorization)?.trim();
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as {
      sub?: unknown;
      tenant_id?: unknown;
    };
    return {
      ...(typeof payload.sub === 'string' ? { sub: payload.sub } : {}),
      ...(typeof payload.tenant_id === 'string' ? { tenantId: payload.tenant_id } : {}),
    };
  } catch {
    return null;
  }
}

export function isUuidV7(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 7;
}

export function normalizedPath(request: {
  originalUrl?: string;
  url?: string;
}): string {
  const value = request.originalUrl ?? request.url ?? '/';
  const [path] = value.split('?');
  return path || '/';
}

export function isOptionalTenancyPath(path: string): boolean {
  return OPTIONAL_TENANCY_PATHS.some((pattern) => pattern.test(path));
}

export function resolveSubdomainTenantId(
  hostHeader: unknown,
  pattern?: RegExp,
): string | undefined {
  const host = headerToString(hostHeader)?.trim();
  if (!host) {
    return undefined;
  }
  const hostname = host.replace(/:\d+$/u, '');
  const labels = hostname.split('.');
  const firstLabel = labels[0]?.trim();
  if (!firstLabel) {
    return undefined;
  }

  if (!pattern) {
    return isUuidV7(firstLabel) ? firstLabel : undefined;
  }

  const match = hostname.match(pattern);
  if (!match) {
    return undefined;
  }
  const candidate = match[1] ?? match[0];
  return candidate?.trim() || undefined;
}
