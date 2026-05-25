import { VeraPdfDockerValidator } from '../../src';

describe('VeraPdfDockerValidator timeout handling', () => {
  it('returns stynx.timeout for a 1 ms adapter timeout', async () => {
    const validator = new VeraPdfDockerValidator({
      timeoutMs: 1,
      runner: async () => ({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: true,
      }),
    });

    const result = await validator.validate(new Uint8Array([37, 80, 68, 70]));

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual({
      ruleId: 'stynx.timeout',
      severity: 'error',
      clause: 'STYNX-PDF-A-R12',
      message: 'veraPDF Docker validation timed out.',
    });
  });
});
