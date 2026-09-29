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

  it('reads valid runtime overrides from the environment and allows an empty logger', async () => {
    const keys = [
      'STYNX_VERAPDF_IMAGE',
      'STYNX_VERAPDF_DOCKER_BIN',
      'STYNX_VERAPDF_TIMEOUT_MS',
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.STYNX_VERAPDF_IMAGE = 'verapdf/env-image';
    process.env.STYNX_VERAPDF_DOCKER_BIN = '/usr/local/bin/docker-env';
    process.env.STYNX_VERAPDF_TIMEOUT_MS = '12345';
    const requests: VeraPdfDockerRunRequest[] = [];
    try {
      const validator = new VeraPdfDockerValidator({
        logger: {},
        runner: async (request) => {
          requests.push(request);
          return {
            stdout: JSON.stringify({
              report: {
                jobs: [{
                  validationResult: {
                    profileName: 'PDF/A-2B',
                    isCompliant: true,
                    details: { failedRules: [] },
                  },
                }],
              },
            }),
            stderr: '',
            exitCode: 0,
            timedOut: false,
          };
        },
      });
      expect((await validator.validate(new Uint8Array())).valid).toBe(true);
      expect(requests[0]).toMatchObject({
        image: 'verapdf/env-image',
        dockerBin: '/usr/local/bin/docker-env',
        timeoutMs: 12345,
      });
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it.each(['invalid', '0'])('ignores invalid timeout environment value %s', async (value) => {
    const previous = process.env.STYNX_VERAPDF_TIMEOUT_MS;
    process.env.STYNX_VERAPDF_TIMEOUT_MS = value;
    const requests: VeraPdfDockerRunRequest[] = [];
    try {
      const validator = new VeraPdfDockerValidator({
        timeoutMs: undefined,
        runner: async (request) => {
          requests.push(request);
          return {
            stdout: JSON.stringify({ report: { jobs: [{ validationResult: {
              profileName: 'PDF/A-2B', isCompliant: true, details: { failedRules: [] },
            } }] } }),
            stderr: '',
            exitCode: 0,
            timedOut: false,
          };
        },
      });
      await validator.validate(new Uint8Array());
      expect(requests[0]?.timeoutMs).toBe(420000);
    } finally {
      if (previous === undefined) delete process.env.STYNX_VERAPDF_TIMEOUT_MS;
      else process.env.STYNX_VERAPDF_TIMEOUT_MS = previous;
    }
  });

  it('uses a stable fallback when Docker fails without stderr text', async () => {
    const validator = new VeraPdfDockerValidator({
      runner: async () => ({ stdout: '{bad json', stderr: '  \n', exitCode: 1, timedOut: false }),
    });
    await expect(validator.validate(new Uint8Array())).rejects.toThrow(/no stderr output/u);
  });

  it('uses the default Docker runner when no runner is configured', async () => {
    const validator = new VeraPdfDockerValidator({
      dockerBin: '/path/that/does/not/exist',
      timeoutMs: 1000,
    });
    await expect(validator.validate(new Uint8Array())).rejects.toThrow(/spawnSync/u);
  });

  it('labels a missing Docker exit code and stderr explicitly', async () => {
    const validator = new VeraPdfDockerValidator({
      runner: async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: false }),
    });
    await expect(validator.validate(new Uint8Array())).rejects.toThrow(
      /exit code unknown: no stderr output/u,
    );
  });
});
