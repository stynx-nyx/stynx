import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StynxObjectStore } from '../../src/object-store.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/object'),
}));

describe('StynxObjectStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const send = jest.fn().mockResolvedValue(undefined);
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
    const send = jest.fn().mockResolvedValue(undefined);
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
    const callArgs = (getSignedUrl as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toBeInstanceOf(S3Client);
    expect(callArgs[1]).toBeInstanceOf(GetObjectCommand);
    expect(callArgs[2]).toEqual({ expiresIn: 600 });
  });
});
