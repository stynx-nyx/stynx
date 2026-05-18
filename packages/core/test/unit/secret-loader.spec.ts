import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretLoader } from '../../src/secret-loader';
import { SecretLoadError } from '../../src/errors';

describe('SecretLoader', () => {
  it('caches the secret value within ttlMs', async () => {
    const send = jest.fn().mockResolvedValueOnce({ SecretString: 'value-1' });
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    const v1 = await loader.getSecretString('id-1');
    const v2 = await loader.getSecretString('id-1');
    expect(v1).toBe('value-1');
    expect(v2).toBe('value-1');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refetches when forceRefresh=true', async () => {
    const send = jest
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

  it('throws SecretLoadError when the SDK returns no SecretString', async () => {
    const send = jest.fn().mockResolvedValueOnce({});
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });

  it('throws SecretLoadError on connection-like errors', async () => {
    const send = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });

  it('rethrows non-connection errors', async () => {
    const send = jest.fn().mockRejectedValueOnce(new TypeError('bad'));
    const loader = new SecretLoader({ secretCacheTtlMs: 60_000 } as never);
    (loader as unknown as { client: { send: typeof send } }).client = { send } as never;

    await expect(loader.getSecretString('id-1')).rejects.toBeInstanceOf(SecretLoadError);
  });
});
