import { InMemoryPermissionCacheBackend } from '../../src/in-memory-permission-cache-backend';

describe('InMemoryPermissionCacheBackend edge branches', () => {
  it('ignores delete and malformed invalidation misses', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    await expect(backend.delete('missing')).resolves.toBeUndefined();
    await expect(backend.invalidateScope('bad')).resolves.toBeUndefined();
  });

  it('publishes to subscribers and clears records on close', async () => {
    const backend = new InMemoryPermissionCacheBackend();
    const seen: string[] = [];
    await backend.subscribe(async (message) => {
      seen.push(message);
    });
    await backend.set({
      sid: 'sid-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['records:read'],
      hash: 'hash',
      generation: 1,
      computedAt: 1,
    });

    await backend.publish('user-1:tenant-1');
    await backend.close();

    expect(seen).toEqual(['user-1:tenant-1']);
    await expect(backend.get('sid-1')).resolves.toBeNull();
  });
});
