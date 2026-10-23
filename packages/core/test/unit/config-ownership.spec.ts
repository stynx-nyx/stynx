import { z } from 'zod';
import {
  ConfigOwnershipViolationError,
  loadStynxConfiguration,
  validateConfigOwnership,
} from '../../src/index.js';

describe('config ownership metadata', () => {
  const schema = z.object({
    GAP003_DB_URL: z.string().optional(),
    GAP003_LOG_LEVEL: z.string().optional(),
  });

  it('reports required ownership violations', () => {
    expect(() =>
      validateConfigOwnership(
        {
          GAP003_DB_URL: '',
          GAP003_LOG_LEVEL: 'info',
        },
        {
          GAP003_DB_URL: {
            owner: 'platform',
            required: true,
          },
        },
      ),
    ).toThrow(ConfigOwnershipViolationError);

    try {
      validateConfigOwnership(
        {
          GAP003_DB_URL: '',
        },
        {
          GAP003_DB_URL: {
            owner: 'platform',
            required: true,
          },
        },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigOwnershipViolationError);
      expect((error as ConfigOwnershipViolationError).violations).toEqual([
        {
          key: 'GAP003_DB_URL',
          reason: 'required by owner "platform" but not set',
        },
      ]);
    }
  });

  it('accepts present required values', () => {
    expect(() =>
      validateConfigOwnership(
        {
          GAP003_DB_URL: 'postgresql://localhost/stynx',
        },
        {
          GAP003_DB_URL: {
            owner: 'platform',
            required: true,
          },
        },
      ),
    ).not.toThrow();
  });

  it('validates ownership after loading configuration', async () => {
    await expect(
      loadStynxConfiguration({
        appName: 'core-test',
        schema,
        defaults: {
          GAP003_DB_URL: '',
        },
        configMetadata: {
          GAP003_DB_URL: {
            owner: 'platform',
            required: true,
          },
        },
      }),
    ).rejects.toBeInstanceOf(ConfigOwnershipViolationError);
  });

  it('retains JavaScript property access on primitive, array and function schema results', () => {
    const required = { owner: 'platform', required: true };
    const callable = Object.assign(() => 'unused', { configured: 'yes' });
    for (const [value, key] of [
      ['configured', 'length'],
      [['configured'], '0'],
      [callable, 'configured'],
    ] as const) {
      expect(() => validateConfigOwnership(value, { [key]: required })).not.toThrow();
    }
    expect(() => validateConfigOwnership('', { length: required })).not.toThrow();
    expect(() => validateConfigOwnership('value', { absent: required })).toThrow(
      ConfigOwnershipViolationError,
    );
    expect(() => validateConfigOwnership(null, { required })).toThrow(TypeError);
    expect(() => validateConfigOwnership(undefined, { required })).toThrow(TypeError);
  });
});
