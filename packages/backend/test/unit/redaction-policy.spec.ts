import { PatternAuditMetadataRedactionPolicy } from '../../src/audit/redaction-policy';

const ctx = { action: 'a', entity: 'e', request: {} as never };

describe('PatternAuditMetadataRedactionPolicy', () => {
  it('returns undefined when metadata is undefined', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    expect(policy.redact(undefined, ctx)).toBe(undefined);
  });

  it('returns the value unchanged for trivial scalar values inside objects', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    expect(policy.redact({ n: 1, b: true, nul: null, undef: undefined }, ctx)).toEqual({
      n: 1,
      b: true,
      nul: null,
      undef: undefined,
    });
  });

  it('redacts values under sensitive keys (default pattern)', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    const out = policy.redact(
      { password: 'p', token: 't', authorization: 'Bearer x', user: 'alice' },
      ctx,
    );
    expect(out).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      authorization: '[REDACTED]',
      user: 'alice',
    });
  });

  it('honors custom sensitiveKeyPattern + replacement', () => {
    const policy = new PatternAuditMetadataRedactionPolicy({
      sensitiveKeyPattern: /^supersecret$/i,
      replacement: '***',
    });
    expect(policy.redact({ supersecret: 'x', token: 't' }, ctx)).toEqual({
      supersecret: '***',
      token: 't',
    });
  });

  it('truncates long strings to maxStringLength with ellipsis', () => {
    const policy = new PatternAuditMetadataRedactionPolicy({ maxStringLength: 5 });
    expect(policy.redact({ s: 'abcdefghijk' }, ctx)).toEqual({ s: 'abcde...' });
  });

  it('truncates large arrays to maxArrayLength', () => {
    const policy = new PatternAuditMetadataRedactionPolicy({ maxArrayLength: 3 });
    const result = policy.redact({ arr: [1, 2, 3, 4, 5] }, ctx) as { arr: unknown[] };
    expect(result.arr).toHaveLength(3);
  });

  it('serializes Date values as ISO strings', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    const date = new Date('2026-05-18T00:00:00.000Z');
    const out = policy.redact({ at: date }, ctx) as { at: string };
    expect(out.at).toBe('2026-05-18T00:00:00.000Z');
  });

  it('emits [MaxDepth] beyond maxDepth', () => {
    const policy = new PatternAuditMetadataRedactionPolicy({ maxDepth: 1 });
    const out = policy.redact({ a: { b: { c: 'deep' } } }, ctx) as Record<string, unknown>;
    // depth boundary stringifies the value at the threshold.
    expect((out.a as { b: unknown }).b).toBe('[MaxDepth]');
  });

  it('returns undefined when metadata sanitizes to an array (root-level array)', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    // Arrays at the root are not valid metadata containers — should return undefined.
    expect(policy.redact([1, 2] as unknown as Record<string, unknown>, ctx)).toBe(undefined);
  });

  it('emits [Unsupported] for function/symbol values', () => {
    const policy = new PatternAuditMetadataRedactionPolicy();
    const out = policy.redact({ fn: () => undefined }, ctx) as Record<string, unknown>;
    expect(out.fn).toBe('[Unsupported]');
  });
});
