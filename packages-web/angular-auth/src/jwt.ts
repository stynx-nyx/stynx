function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  if (typeof atob === 'function') {
    return atob(`${normalized}${padding}`);
  }
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

export function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizePermissions(payload: Record<string, unknown> | null): string[] {
  if (!payload) {
    return [];
  }
  const raw = payload.permissions ?? payload.scope;
  if (typeof raw === 'string') {
    return raw.split(' ').map((value) => value.trim()).filter((value) => value.length > 0);
  }
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  }
  return [];
}
