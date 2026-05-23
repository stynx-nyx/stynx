// Vitest's hoister lifts vi.mock above the imports but NOT top-level
// `const mockX = vi.fn(...)` declarations, so those reference TDZ values
// inside the factory. `vi.hoisted` is the official escape hatch.
const mockSsmSend = vi.hoisted(() => vi.fn());
const mockSsmClient = vi.hoisted(() => vi.fn(() => ({ send: mockSsmSend })));
const mockGetParametersByPathCommand = vi.hoisted(() => vi.fn((input) => ({ input })));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: mockSsmClient,
  GetParametersByPathCommand: mockGetParametersByPathCommand,
}));

import { z } from 'zod';
import { ConfigurationValidationError, loadStynxConfiguration, StynxConfigService } from '../../src';

describe('loadStynxConfiguration SSM loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SSM_ONLY;
  });

  it('loads paged SSM values using the default environment prefix', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'qa';
    mockSsmSend
      .mockResolvedValueOnce({
        Parameters: [
          { Name: '/stynx/qa/core-test/SSM_ONLY', Value: 'from-ssm' },
          { Name: '/stynx/qa/core-test/', Value: 'ignored' },
          { Name: undefined, Value: 'ignored' },
        ],
        NextToken: 'next',
      })
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/stynx/qa/core-test/PAGED_VALUE', Value: 'paged' }],
      });

    try {
      await expect(loadStynxConfiguration({
        appName: 'core-test',
        schema: z.object({
          SSM_ONLY: z.string(),
          PAGED_VALUE: z.string(),
        }),
        ssm: { enabled: true, clientConfig: { region: 'us-east-1' } },
      })).resolves.toEqual({
        SSM_ONLY: 'from-ssm',
        PAGED_VALUE: 'paged',
      });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    expect(mockSsmClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(mockGetParametersByPathCommand).toHaveBeenCalledWith(expect.objectContaining({
      Path: '/stynx/qa/core-test/',
      NextToken: undefined,
    }));
    expect(mockGetParametersByPathCommand).toHaveBeenCalledWith(expect.objectContaining({
      NextToken: 'next',
    }));
  });

  it('loads SSM values using an explicit prefix and default client config', async () => {
    mockSsmSend.mockResolvedValueOnce({
      Parameters: [
        { Name: '/custom/core-test/EXPLICIT_VALUE', Value: 'explicit' },
      ],
    });

    await expect(loadStynxConfiguration({
      appName: 'core-test',
      schema: z.object({
        EXPLICIT_VALUE: z.string(),
      }),
      ssm: { enabled: true, pathPrefix: '/custom/core-test/' },
    })).resolves.toEqual({
      EXPLICIT_VALUE: 'explicit',
    });

    expect(mockSsmClient).toHaveBeenCalledWith();
    expect(mockGetParametersByPathCommand).toHaveBeenCalledWith(expect.objectContaining({
      Path: '/custom/core-test/',
    }));
  });

  it('uses the dev SSM prefix fallback and accepts empty parameter pages', async () => {
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    mockSsmSend.mockResolvedValueOnce({});

    try {
      await expect(loadStynxConfiguration({
        appName: 'core-test',
        schema: z.object({ VALUE: z.string() }),
        defaults: { VALUE: 'from-default' },
        ssm: { enabled: true },
      })).resolves.toEqual({
        VALUE: 'from-default',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalEnv;
      }
    }

    expect(mockGetParametersByPathCommand).toHaveBeenCalledWith(expect.objectContaining({
      Path: '/stynx/dev/core-test/',
    }));
  });

  it('reports schema validation failures after merging defaults and env', async () => {
    await expect(loadStynxConfiguration({
      appName: 'core-test',
      schema: z.object({ REQUIRED_VALUE: z.string() }),
      defaults: {},
    })).rejects.toBeInstanceOf(ConfigurationValidationError);
  });

  it('ignores empty ownership metadata entries', async () => {
    await expect(loadStynxConfiguration({
      appName: 'core-test',
      schema: z.object({ VALUE: z.string() }),
      defaults: { VALUE: 'ok' },
      configMetadata: {
        VALUE: undefined,
      },
    })).resolves.toEqual({ VALUE: 'ok' });
  });

  it('exposes config values and optional module metadata through StynxConfigService', () => {
    const service = new StynxConfigService({ VALUE: 'ok' }, { appName: 'core-test', schema: z.object({}) } as never);
    expect(service.get('VALUE')).toBe('ok');
    expect(service.appName).toBe('core-test');
    expect(service.snapshot()).toEqual({ VALUE: 'ok' });

    const serviceWithoutOptions = new StynxConfigService({ VALUE: 'ok' });
    expect(serviceWithoutOptions.appName).toBe(undefined);
  });
});
