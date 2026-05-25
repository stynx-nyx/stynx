import { NoopPdfAValidator } from '../../src';

describe('NoopPdfAValidator', () => {
  it('returns a passing PDF/A-2b result by default', async () => {
    const validator = new NoopPdfAValidator();

    const result = await validator.validate(new Uint8Array([1, 2, 3]));

    expect(result).toEqual({
      valid: true,
      declared: { version: 'A-2', conformance: 'b' },
      rulesetVersion: 'stynx-noop',
      validatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
      durationMs: 0,
      errors: [],
    });
    expect(Date.parse(result.validatedAt)).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('honors requested declaration metadata', async () => {
    const validator = new NoopPdfAValidator();

    const result = await validator.validate(new Uint8Array(), {
      version: 'A-3',
      conformance: 'u',
    });

    expect(result.declared).toEqual({ version: 'A-3', conformance: 'u' });
  });
});
