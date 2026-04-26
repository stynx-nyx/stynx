import { randomBytes } from 'node:crypto';

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function createUuidV7(timestampMs = Date.now()): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(timestampMs);
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
