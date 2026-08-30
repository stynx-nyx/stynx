import {
  DEFAULT_VERAPDF_IMAGE,
  flavourFrom,
  VeraPdfDockerError,
  VeraPdfDockerValidator,
  VeraPdfReportParseError,
} from '../../src';
import type { VeraPdfDockerRunRequest } from '../../src';

describe('VeraPdfDockerValidator', () => {
  it('runs the pinned image and emits validation telemetry', async () => {
    const requests: VeraPdfDockerRunRequest[] = [];
    const logger = {
      increment: vi.fn(),
      observe: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const validator = new VeraPdfDockerValidator({
      logger,
      runner: async (request) => {
        requests.push(request);
        return {
          stdout: JSON.stringify({
            report: {
              buildInformation: { releaseDetails: { version: '1.28.2' } },
              jobs: [
                {
                  validationResult: {
                    profileName: 'PDF/A-2B validation profile',
                    isCompliant: true,
                    details: { failedRules: [] },
                  },
                },
              ],
            },
          }),
          stderr: '',
          exitCode: 0,
          timedOut: false,
        };
      },
    });

    const result = await validator.validate(new Uint8Array([1, 2, 3]));

    expect(result.valid).toBe(true);
    expect(requests).toEqual([
      {
        dockerBin: 'docker',
        image: DEFAULT_VERAPDF_IMAGE,
        flavour: '2b',
        pdf: new Uint8Array([1, 2, 3]),
        timeoutMs: 420000,
      },
    ]);
    expect(logger.increment).toHaveBeenCalledWith('pdf_a_validation_attempts_total', {
      flavour: '2b',
    });
    expect(logger.observe).toHaveBeenCalledWith(
      'pdf_a_validation_duration_ms',
      expect.any(Number),
      {
        flavour: '2b',
        valid: 'true',
      },
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/^pdf\/a validation completed valid=true/u),
    );
  });

  it('returns a synthetic timeout result', async () => {
    const validator = new VeraPdfDockerValidator({
      timeoutMs: 1,
      runner: async () => ({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: true,
      }),
    });

    const result = await validator.validate(new Uint8Array());

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      {
        ruleId: 'stynx.timeout',
        severity: 'error',
        clause: 'STYNX-PDF-A-R12',
        message: 'veraPDF Docker validation timed out.',
      },
    ]);
  });

  it('throws a descriptive error for non-zero Docker exits', async () => {
    const validator = new VeraPdfDockerValidator({
      runner: async () => ({
        stdout: '',
        stderr: 'Cannot connect to the Docker daemon\nmore noise',
        exitCode: 125,
        timedOut: false,
      }),
    });

    await expect(validator.validate(new Uint8Array())).rejects.toThrow(VeraPdfDockerError);
    await expect(validator.validate(new Uint8Array())).rejects.toThrow(
      /exit code 125: Cannot connect to the Docker daemon/u,
    );
  });

  it('maps requested PDF/A options to veraPDF flavours', () => {
    expect(flavourFrom()).toBe('2b');
    expect(flavourFrom({ version: 'A-1', conformance: 'a' })).toBe('1a');
    expect(flavourFrom({ version: 'A-4', conformance: 'u' })).toBe('4u');
  });

  it('propagates a status-zero semantic rejection without success telemetry', async () => {
    const logger = {
      increment: vi.fn(),
      observe: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const validator = new VeraPdfDockerValidator({
      logger,
      runner: async () => ({
        stdout: JSON.stringify({ report: { jobs: [{}] } }),
        stderr: '',
        exitCode: 0,
        timedOut: false,
      }),
    });

    const rejection = await validator.validate(new Uint8Array()).catch((error: unknown) => error);
    expect(rejection).toBeInstanceOf(VeraPdfReportParseError);
    expect(rejection).toMatchObject({ message: 'VERAPDF_REPORT_VALIDATION_MISSING' });
    expect(logger.increment).toHaveBeenCalledTimes(1);
    expect(logger.observe).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });
});
