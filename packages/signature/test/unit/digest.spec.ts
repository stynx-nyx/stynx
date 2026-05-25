import { canonicalJson, canonicalXmlDigest, sha256 } from '../../src';

describe('digest helpers', () => {
  it('computes deterministic SHA-256 encodings for strings and bytes', () => {
    const bytes = Buffer.from('SGP payload', 'utf8');

    expect(sha256('SGP payload')).toBe(sha256(bytes));
    expect(sha256(bytes, { encoding: 'base64' })).toBe(
      'M6Jeao0xxM4kO5WzSPZo7fGi7tbykYfRE6SZEAPTA4c=',
    );
  });

  it('canonicalizes object keys before digesting SGP-shaped XML metadata', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalXmlDigest('\r\n<evento Id="E1">ok</evento>\r\n')).toBe(
      sha256('<evento Id="E1">ok</evento>'),
    );
  });
});
