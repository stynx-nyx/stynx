import { createHash } from 'node:crypto';

export type Sha256Encoding = 'hex' | 'base64';

export interface Sha256Options {
  encoding?: Sha256Encoding;
}

export function sha256(input: string | Buffer | Uint8Array, options: Sha256Options = {}): string {
  return createHash('sha256')
    .update(toBytes(input))
    .digest(options.encoding ?? 'hex');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256CanonicalJson(value: unknown, options: Sha256Options = {}): string {
  return sha256(canonicalJson(value), options);
}

export function canonicalXmlDigest(xml: string, options: Sha256Options = {}): string {
  return sha256(normalizeXml(xml), options);
}

function toBytes(input: string | Buffer | Uint8Array): Buffer | Uint8Array {
  return typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
}

function normalizeXml(xml: string): string {
  return xml.trim().replace(/\r\n?/gu, '\n');
}
