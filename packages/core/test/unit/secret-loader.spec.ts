import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretLoader } from '../../src/secret-loader';
import { SecretLoadError } from '../../src/errors';

describe('SecretLoader', () => {
  it('caches the secret value within ttlMs', async () => {
    const send = vi.fn().mockResolvedValueOnce({ SecretString: 'value-1' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    const v1 = await loader.getSecretString('id-1');
    const v2 = await loader.getSecretString('id-1');
    expect(v1).toBe('value-1');
    expect(v2).toBe('value-1');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refetches when forceRefresh=true', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ SecretString: 'a' })
      .mockResolvedValueOnce({ SecretString: 'b' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    const a = await loader.getSecretString('id-1');
    const b = await loader.getSecretString('id-1', true);
    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('refetches when the cached secret expires exactly at the current time', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ SecretString: 'a' })
      .mockResolvedValueOnce({ SecretString: 'b' });
    const loader = new SecretLoader({ secretCacheTtlMs: 1_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    try {
      await expect(loader.getSecretString('id-1')).resolves.toBe('a');
      await expect(loader.getSecretString('id-1')).resolves.toBe('b');
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('refetches after invalidating a cached secret', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ SecretString: 'a' })
      .mockResolvedValueOnce({ SecretString: 'b' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).resolves.toBe('a');
    loader.invalidate('id-1');
    await expect(loader.getSecretString('id-1')).resolves.toBe('b');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses default 5-minute TTL when not configured', () => {
    const loader = new SecretLoader();
    expect((loader as unknown as { ttlMs: number }).ttlMs).toBe(5 * 60 * 1000);
  });

  it('uses configured secretCacheTtlMs', () => {
    const loader = new SecretLoader({ secretCacheTtlMs: 1000 } as never);
    expect((loader as unknown as { ttlMs: number }).ttlMs).toBe(1000);
  });

  it('constructs a SecretsManagerClient with no config when none provided', () => {
    const loader = new SecretLoader();
    expect((loader as unknown as { client: unknown }).client).toBeInstanceOf(SecretsManagerClient);
  });

  it('constructs a SecretsManagerClient with configured client options', () => {
    const loader = new SecretLoader({ secretsClientConfig: { region: 'us-east-1' } } as never);
    expect((loader as unknown as { client: unknown }).client).toBeInstanceOf(SecretsManagerClient);
  });

  it('throws SecretLoadError when the SDK returns no SecretString', async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });

  it('throws SecretLoadError when the SDK returns an empty SecretString', async () => {
    const send = vi.fn().mockResolvedValueOnce({ SecretString: '' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'SecretString is empty' }),
    });
  });

  it('throws SecretLoadError on connection-like errors', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });

  it('rethrows non-connection errors', async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('bad'));
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });

  it('refreshes a cached secret after a connection-like run failure', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ SecretString: 'old-secret' })
      .mockResolvedValueOnce({ SecretString: 'new-secret' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce('ok');

    await expect(loader.withConnectionErrorRefresh('id-1', run)).resolves.toBe('ok');

    expect(run).toHaveBeenNthCalledWith(1, 'old-secret');
    expect(run).toHaveBeenNthCalledWith(2, 'new-secret');
    expect(send).toHaveBeenCalledTimes(2);
    await expect(loader.getSecretString('id-1')).resolves.toBe('new-secret');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not refresh after non-connection run failures', async () => {
    const send = vi.fn().mockResolvedValueOnce({ SecretString: 'secret' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.withConnectionErrorRefresh('id-1', async () => {
      throw new TypeError('bad input');
    })).rejects.toThrow('bad input');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not refresh after non-Error run failures', async () => {
    const send = vi.fn().mockResolvedValueOnce({ SecretString: 'secret' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.withConnectionErrorRefresh('id-1', async () => {
      throw 'bad input';
    })).rejects.toBe('bad input');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
