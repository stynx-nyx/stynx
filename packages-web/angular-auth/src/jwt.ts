const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    return atob(value);
  }

  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const character of value) {
    if (character === '=') {
      break;
    }
    const sextet = base64Alphabet.indexOf(character);
    if (sextet < 0) {
      throw new Error('Invalid base64 input');
    }
    buffer = (buffer << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = decodeBase64(`${normalized}${padding}`);
  if (typeof TextDecoder === 'function') {
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return binary;
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
