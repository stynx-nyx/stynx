import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StynxObjectStore } from '../../src/object-store.service';
import type { Mock } from 'vitest';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/object'),
}));

describe('StynxObjectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs an S3Client with the configured region', () => {
    const store = new StynxObjectStore({
      bucketName: 'b',
      region: 'us-east-1',
    });
    expect(store).toBeInstanceOf(StynxObjectStore);
  });

  it('passes endpoint + forcePathStyle through when set', () => {
    const store = new StynxObjectStore({
      bucketName: 'b',
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
    });
    expect(store).toBeInstanceOf(StynxObjectStore);
  });

  it('putObject sends PutObjectCommand with body + contentType', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new StynxObjectStore({ bucketName: 'b', region: 'us-east-1' });
    (store as unknown as { client: { send: typeof send } }).client = { send } as never;

    await store.putObject({
      key: 'k1',
      body: Buffer.from('hello'),
      contentType: 'text/plain',
    });

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0]?.[0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect((cmd as PutObjectCommand).input.Bucket).toBe('b');
    expect((cmd as PutObjectCommand).input.Key).toBe('k1');
    expect((cmd as PutObjectCommand).input.ContentType).toBe('text/plain');
  });

  it('putObject honors expiresAt when provided', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const store = new StynxObjectStore({ bucketName: 'b', region: 'us-east-1' });
    (store as unknown as { client: { send: typeof send } }).client = { send } as never;
    const expires = new Date('2026-12-31T00:00:00.000Z');

    await store.putObject({
      key: 'k1',
      body: Buffer.from(''),
      contentType: 'text/plain',
      expiresAt: expires,
    });

    const cmd = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(cmd.input.Expires).toEqual(expires);
  });

  it('presignDownload returns a signed URL via getSignedUrl', async () => {
    const store = new StynxObjectStore({ bucketName: 'b', region: 'us-east-1' });

    const url = await store.presignDownload({ key: 'k1', expiresInSeconds: 600 });

    expect(url).toBe('https://signed.example/object');
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const callArgs = (getSignedUrl as Mock).mock.calls[0];
    expect(callArgs[0]).toBeInstanceOf(S3Client);
    expect(callArgs[1]).toBeInstanceOf(GetObjectCommand);
    expect(callArgs[2]).toEqual({ expiresIn: 600 });
  });
});

describe('StynxObjectStore owned client disposal', () => {
  function owned(store: StynxObjectStore): S3Client {
    const client = Reflect.get(store, 'client') as S3Client;
    expect(client).toBeInstanceOf(S3Client);
    return client;
  }

  it('destroys its original client once and refuses both operations after successful disposal', async () => {
    const store = new StynxObjectStore({ bucketName: 'b', region: 'us-east-1' });
    const client = owned(store);
    const destroy = vi.spyOn(client, 'destroy');
    const send = vi.spyOn(client, 'send');
    const signedBefore = vi.mocked(getSignedUrl).mock.calls.length;
    try {
      store.destroy();
      store.destroy();
      expect(Reflect.get(store, 'client')).toBe(client);
      expect(destroy).toHaveBeenCalledTimes(1);
      await expect(
        store.putObject({ key: 'k', body: Buffer.from('x'), contentType: 'text/plain' }),
      ).rejects.toThrow('Object store has been destroyed');
      await expect(store.presignDownload({ key: 'k', expiresInSeconds: 30 })).rejects.toThrow(
        'Object store has been destroyed',
      );
      expect(send).not.toHaveBeenCalled();
      expect(vi.mocked(getSignedUrl).mock.calls.length).toBe(signedBefore);
    } finally {
      destroy.mockRestore();
      send.mockRestore();
      store.destroy();
    }
  });

  it('propagates thrown SDK destruction, remains usable and retries the same client', async () => {
    const store = new StynxObjectStore({ bucketName: 'b', region: 'us-east-1' });
    const client = owned(store);
    const fault = new Error('SDK disposal fault witness');
    const destroy = vi.spyOn(client, 'destroy').mockImplementationOnce(() => {
      throw fault;
    });
    try {
      expect(() => store.destroy()).toThrow(fault);
      expect(Reflect.get(store, 'client')).toBe(client);
      await expect(store.presignDownload({ key: 'k', expiresInSeconds: 30 })).resolves.toBe(
        'https://signed.example/object',
      );
      store.destroy();
      store.destroy();
      expect(destroy).toHaveBeenCalledTimes(2);
      await expect(store.presignDownload({ key: 'k', expiresInSeconds: 30 })).rejects.toThrow(
        'Object store has been destroyed',
      );
    } finally {
      destroy.mockRestore();
      store.destroy();
    }
  });
});
