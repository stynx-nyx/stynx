const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(base64);
  }

  throw new Error('Base64 decoding is not available in this runtime');
};

export const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
};
