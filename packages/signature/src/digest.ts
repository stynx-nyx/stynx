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

export function canonicalJson(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

export function sha256CanonicalJson(value: unknown, options: Sha256Options = {}): string {
  const canonical = canonicalJson(value);
  const hash = createHash('sha256');
  const bytes = typeof canonical === 'string' ? Buffer.from(canonical, 'utf8') : canonical;
  // The fixed native hash operation retains Node's existing error for undefined.
  // No assertion claims that an unsupported canonical result is valid input.
  Reflect.apply(hash.update, hash, [bytes]);
  return hash.digest(options.encoding ?? 'hex');
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
