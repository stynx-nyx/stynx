import { MembershipAccessCache } from '../../src/membership-cache';

describe('MembershipAccessCache', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('expires entries after the configured ttl', () => {
    const now = 1_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = new MembershipAccessCache(5, 10);

    cache.set('user-1', 'tenant-1', true);
    expect(cache.get('user-1', 'tenant-1')).toBe(true);

    dateNow.mockReturnValue(now + 6);

    expect(cache.get('user-1', 'tenant-1')).toBe(undefined);
  });

  it('evicts the oldest entry when it exceeds capacity', () => {
    const cache = new MembershipAccessCache(1_000, 1);
    cache.set('user-1', 'tenant-1', true);
    cache.set('user-2', 'tenant-2', false);
    expect(cache.get('user-1', 'tenant-1')).toBe(undefined);
    expect(cache.get('user-2', 'tenant-2')).toBe(false);
  });

  it('treats entries as expired exactly at the ttl boundary', () => {
    const now = 1_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = new MembershipAccessCache(25, 10);

    cache.set('user-1', 'tenant-1', true);
    dateNow.mockReturnValue(now + 25);

    expect(cache.get('user-1', 'tenant-1')).toBe(undefined);
  });

  it('clears all entries and invalidates only the requested tenant', () => {
    const cache = new MembershipAccessCache(1_000, 10);
    cache.set('user-1', 'tenant-1', true);
    cache.set('user-2', 'tenant-2', false);
    cache.set('user-3', 'tenant-1', false);

    cache.invalidateTenant('tenant-1');

    expect(cache.get('user-1', 'tenant-1')).toBe(undefined);
    expect(cache.get('user-3', 'tenant-1')).toBe(undefined);
    expect(cache.get('user-2', 'tenant-2')).toBe(false);

    cache.clear();

    expect(cache.get('user-2', 'tenant-2')).toBe(undefined);
  });
});
