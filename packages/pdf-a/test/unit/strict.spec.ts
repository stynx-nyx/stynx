import { StrictPdfAValidator } from '../../src';

describe('StrictPdfAValidator', () => {
  it('always fails with a configured-validator error', async () => {
    const validator = new StrictPdfAValidator();

    const result = await validator.validate(new Uint8Array([37, 80, 68, 70]));

    expect(result.valid).toBe(false);
    expect(result.declared).toEqual({ version: 'A-2', conformance: 'b' });
    expect(result.errors).toEqual([
      {
        ruleId: 'stynx.validator.missing',
        severity: 'error',
        clause: 'STYNX-PDF-A-R12',
        message: 'No real PDF/A validator configured.',
      },
    ]);
    expect(Date.parse(result.validatedAt)).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
