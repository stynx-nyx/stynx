import { StynxPlatformInfoGuard } from '../../src/info.guard';

describe('StynxPlatformInfoGuard', () => {
  it('blocks access when the platform flag is disabled', () => {
    const original = process.env.STYNX_PLATFORM_INFO_ENABLED;
    delete process.env.STYNX_PLATFORM_INFO_ENABLED;

    try {
      const guard = new StynxPlatformInfoGuard({});
      expect(() => guard.canActivate()).toThrow('Platform info endpoint is disabled');
    } finally {
      process.env.STYNX_PLATFORM_INFO_ENABLED = original;
    }
  });

  it('allows access when the platform flag is enabled', () => {
    const original = process.env.STYNX_PLATFORM_INFO_ENABLED;
    process.env.STYNX_PLATFORM_INFO_ENABLED = 'true';

    try {
      const guard = new StynxPlatformInfoGuard({});
      expect(guard.canActivate()).toBe(true);
    } finally {
      process.env.STYNX_PLATFORM_INFO_ENABLED = original;
    }
  });
});
