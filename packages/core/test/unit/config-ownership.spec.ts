import { z } from 'zod';
import {
  ConfigOwnershipViolationError,
  loadStynxConfiguration,
  validateConfigOwnership,
} from '../../src';

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
});
