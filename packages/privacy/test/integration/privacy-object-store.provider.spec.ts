import 'reflect-metadata';
import { once } from 'node:events';
import { get } from 'node:http';
import type { Agent, Server } from 'node:http';
import { Socket } from 'node:net';
import { Controller, Get, Inject, Injectable, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

// Exercise the public compiled package graph and the real AWS SDK, without source aliases.
const require = createRequire(import.meta.url);
const { PrivacyObjectStoreService, STYNX_PRIVACY_OPTIONS } =
  require('@stynx-nyx/privacy') as typeof import('../../src');
const { S3Service, STYNX_STORAGE_OPTIONS, StynxObjectStore } =
  require('@stynx-nyx/storage') as typeof import('@stynx-nyx/storage');

// The adapter is loaded through the actual compiled CommonJS package graph.
// Resolve its SDK constructor from that same boundary; Vitest's ESM SDK import
// is a distinct module instance and does not identify the producer's client.
const { S3Client: OwnedS3Client } = createRequire(require.resolve('@stynx-nyx/storage'))(
  '@aws-sdk/client-s3',
) as typeof import('@aws-sdk/client-s3');

function ownedPrivacyClient(value: InstanceType<typeof PrivacyObjectStoreService>): S3Client {
  const objectStore = Reflect.get(value, 'objectStore');
  expect(objectStore).toBeInstanceOf(StynxObjectStore);
  const client = Reflect.get(objectStore, 'client') as S3Client;
  expect(client).toBeInstanceOf(OwnedS3Client);
  expect(Object.getPrototypeOf(client).constructor).toBe(OwnedS3Client);
  return client;
}

async function bounded<T>(promise: Promise<T>, phase: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Owned lifecycle witness timed out: ${phase}`)),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// LocalStack is the repository's declared local S3 fixture, not production qualification.
describe('PrivacyObjectStoreService supported local S3 provider', () => {
  const region = 'us-east-1';
  const bucketName = `stynx-privacy-provider-${randomUUID()}`;
  const tenantA = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
  const tenantB = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
  const keyA = `exports/${tenantA}/${randomUUID()}.zip`;
  const keyB = `exports/${tenantB}/${randomUUID()}.zip`;
  const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
  const environmentKeys = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'AWS_EC2_METADATA_DISABLED',
  ] as const;
  const priorEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  let container: StartedTestContainer | undefined;
  let admin: S3Client | undefined;
  let endpoint: string;
  let store: InstanceType<typeof PrivacyObjectStoreService>;
  let bytesA: Buffer;
  let bytesB: Buffer;

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    delete process.env.AWS_SESSION_TOKEN;
    process.env.AWS_REGION = region;
    process.env.AWS_EC2_METADATA_DISABLED = 'true';
    container = await new GenericContainer('localstack/localstack:3.8.1')
      .withEnvironment({
        SERVICES: 's3',
        AWS_DEFAULT_REGION: region,
        S3_SKIP_SIGNATURE_VALIDATION: '0',
      })
      .withExposedPorts(4566)
      .withWaitStrategy(Wait.forLogMessage(/Ready\./))
      .start();
    endpoint = `http://${container.getHost()}:${container.getMappedPort(4566)}`;
    admin = new S3Client({ region, endpoint, forcePathStyle: true, credentials });
    await admin.send(new CreateBucketCommand({ Bucket: bucketName }));
    store = new PrivacyObjectStoreService({
      environment: 'test',
      region,
      bucketName,
      endpoint,
      forcePathStyle: true,
    });
    bytesA = await new JSZip()
      .file('manifest.json', JSON.stringify({ tenantId: tenantA, format: 'json' }))
      .file('privacy.subjects.json', JSON.stringify([{ tenantId: tenantA, name: 'João 日本語' }]))
      .generateAsync({ type: 'nodebuffer' });
    bytesB = await new JSZip()
      .file('manifest.json', JSON.stringify({ tenantId: tenantB, format: 'json' }))
      .file('privacy.subjects.json', JSON.stringify([{ tenantId: tenantB, name: 'Other tenant' }]))
      .generateAsync({ type: 'nodebuffer' });
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip' });
    await store.putObject({ key: keyB, body: bytesB, contentType: 'application/zip' });
  }, 120_000);

  afterAll(async () => {
    try {
      store?.onApplicationShutdown();
      admin?.destroy();
      await container?.stop();
    } finally {
      for (const key of environmentKeys) {
        const value = priorEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 120_000);

  it('uploads exact ZIP bytes, content type and Expires through the public adapter', async () => {
    const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 3_600_000);
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip', expiresAt });
    const head = await admin!.send(new HeadObjectCommand({ Bucket: bucketName, Key: keyA }));
    expect(head.ContentLength).toBe(bytesA.length);
    expect(head.ContentType).toBe('application/zip');
    expect(head.Expires?.getTime()).toBe(expiresAt.getTime());
    const url = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(endpoint);
    expect(decodeURIComponent(parsed.pathname)).toBe(`/${bucketName}/${keyA}`);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('30');
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const downloaded = Buffer.from(await response.arrayBuffer());
    expect(downloaded).toEqual(bytesA);
    const zip = await JSZip.loadAsync(downloaded);
    expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', 'privacy.subjects.json']);
    expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({
      tenantId: tenantA,
      format: 'json',
    });
    expect(JSON.parse(await zip.file('privacy.subjects.json')!.async('string'))).toEqual([
      { tenantId: tenantA, name: 'João 日本語' },
    ]);
  });

  it('preserves distinct tenant keys and confines a signed download to its exact object', async () => {
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip' });
    await store.putObject({ key: keyB, body: bytesB, contentType: 'application/zip' });
    const roster = await admin!.send(new ListObjectsV2Command({ Bucket: bucketName }));
    expect(roster.Contents?.map((object) => object.Key).sort()).toEqual([keyA, keyB].sort());
    const signedA = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    const signedB = await store.presignDownload({ key: keyB, expiresInSeconds: 30 });
    expect(Buffer.from(await (await fetch(signedA)).arrayBuffer())).toEqual(bytesA);
    expect(Buffer.from(await (await fetch(signedB)).arrayBuffer())).toEqual(bytesB);
    const tampered = new URL(signedA);
    tampered.pathname = `/${bucketName}/${keyB}`;
    const refused = await fetch(tampered);
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('SignatureDoesNotMatch');
  });

  it('enforces actual signed-URL expiry while preserving separately uploaded bytes', async () => {
    await store.putObject({
      key: keyA,
      body: bytesA,
      contentType: 'application/zip',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const signed = await store.presignDownload({ key: keyA, expiresInSeconds: 3 });
    expect(new URL(signed).searchParams.get('X-Amz-Expires')).toBe('3');
    expect((await fetch(signed)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 4_100));
    const expired = await fetch(signed);
    expect(expired.status).toBe(403);
    expect(await expired.text()).toMatch(/expired/iu);
    const fresh = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    expect(Buffer.from(await (await fetch(fresh)).arrayBuffer())).toEqual(bytesA);
  });

  it('propagates actual S3 upload failures and SDK presign-bound refusals', async () => {
    const missingBucket = new PrivacyObjectStoreService({
      environment: 'test',
      region,
      bucketName: `missing-${randomUUID()}`,
      endpoint,
      forcePathStyle: true,
    });
    try {
      await expect(
        missingBucket.putObject({
          key: keyA,
          body: bytesA,
          contentType: 'application/zip',
        }),
      ).rejects.toMatchObject({ name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } });
    } finally {
      missingBucket.onApplicationShutdown();
    }
    await expect(
      store.presignDownload({ key: keyA, expiresInSeconds: 604_801 }),
    ).rejects.toMatchObject({
      name: 'Error',
      message:
        'Signature version 4 presigned URLs must have an expiration date less than one week in the future',
    });
    const roster = await admin!.send(new ListObjectsV2Command({ Bucket: bucketName }));
    expect(roster.Contents?.map((object) => object.Key).sort()).toEqual([keyA, keyB].sort());
  });

  it('retries a failed actual-client destroy and refuses uploads and signing after successful shutdown', async () => {
    const value = new PrivacyObjectStoreService({
      environment: 'test',
      region,
      bucketName,
      endpoint,
      forcePathStyle: true,
    });
    const client = ownedPrivacyClient(value);
    const failure = new Error('SDK destroy failure witness');
    const destroy = vi.spyOn(client, 'destroy').mockImplementationOnce(() => {
      throw failure;
    });
    const retryKey = `exports/${tenantA}/retry-${randomUUID()}.zip`;
    try {
      expect(() => value.onApplicationShutdown()).toThrow(failure);
      expect(ownedPrivacyClient(value)).toBe(client);
      await value.putObject({ key: retryKey, body: bytesA, contentType: 'application/zip' });
      const url = await value.presignDownload({ key: retryKey, expiresInSeconds: 30 });
      expect(Buffer.from(await (await fetch(url)).arrayBuffer())).toEqual(bytesA);
      value.onApplicationShutdown();
      value.onApplicationShutdown();
      expect(destroy).toHaveBeenCalledTimes(2);
      await expect(
        value.putObject({ key: retryKey, body: bytesB, contentType: 'application/zip' }),
      ).rejects.toThrow('Object store has been destroyed');
      await expect(value.presignDownload({ key: retryKey, expiresInSeconds: 30 })).rejects.toThrow(
        'Object store has been destroyed',
      );
      expect(Buffer.from(await (await fetch(url)).arrayBuffer())).toEqual(bytesA);
    } finally {
      destroy.mockRestore();
      value.onApplicationShutdown();
    }
  });

  it('real Nest shutdown drains an active HTTP request before both owned clients destroy their actual socket pools', async () => {
    const events: string[] = [];
    let entered!: () => void, resume!: () => void, beforeShutdown!: () => void;
    const requestEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const requestResumed = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const shuttingDown = new Promise<void>((resolve) => {
      beforeShutdown = resolve;
    });
    const drainKey = `exports/${tenantA}/drain-${randomUUID()}.zip`;
    const docsBucket = 'stynx-docs-test-us-east-1';
    await admin!.send(new CreateBucketCommand({ Bucket: docsBucket }));
    await admin!.send(
      new (await import('@aws-sdk/client-s3')).PutObjectCommand({
        Bucket: docsBucket,
        Key: drainKey,
        Body: bytesA,
        ContentType: 'application/zip',
      }),
    );

    @Controller()
    class DrainController {
      constructor(
        @Inject(PrivacyObjectStoreService)
        readonly privacy: InstanceType<typeof PrivacyObjectStoreService>,
      ) {}
      @Get('drain')
      async drain() {
        events.push('request-entered');
        entered();
        await requestResumed;
        await this.privacy.putObject({
          key: drainKey,
          body: bytesA,
          contentType: 'application/zip',
        });
        events.push('actual-upload-complete');
        return { written: true };
      }
    }
    @Injectable()
    class ShutdownObserver {
      onModuleDestroy() {
        events.push('module-destroy');
      }
      beforeApplicationShutdown() {
        events.push('before-application-shutdown');
        beforeShutdown();
      }
    }
    @Module({
      controllers: [DrainController],
      providers: [
        PrivacyObjectStoreService,
        {
          provide: STYNX_PRIVACY_OPTIONS,
          useValue: { environment: 'test', region, bucketName, endpoint, forcePathStyle: true },
        },
        S3Service,
        {
          provide: STYNX_STORAGE_OPTIONS,
          useValue: {
            environment: 'test',
            region,
            kmsAlias: 'docs',
            collections: {},
            endpoint,
            forcePathStyle: true,
          },
        },
        ShutdownObserver,
      ],
    })
    class DrainModule {}

    let app: INestApplication | undefined;
    let closing: Promise<void> | undefined;
    let request: ReturnType<typeof get> | undefined;
    const restores: Array<() => void> = [];
    const socketClosures: Array<Promise<unknown>> = [];
    const actualSockets: Socket[] = [];
    try {
      app = await NestFactory.create(DrainModule, { logger: false });
      const privacy =
        app.get<InstanceType<typeof PrivacyObjectStoreService>>(PrivacyObjectStoreService);
      const storage = app.get<InstanceType<typeof S3Service>>(S3Service);
      const privacyClient = ownedPrivacyClient(privacy);
      const storageClient = Reflect.get(storage, 'client') as S3Client;
      expect(storageClient).toBeInstanceOf(OwnedS3Client);
      expect(Object.getPrototypeOf(storageClient).constructor).toBe(OwnedS3Client);
      expect(storageClient).not.toBe(privacyClient);
      await privacy.putObject({ key: drainKey, body: bytesA, contentType: 'application/zip' });
      await storage.headObject(drainKey);
      const destroySpies = [];
      const handlerSpies = [];
      const agentSpies = [];
      for (const [name, client] of [
        ['privacy', privacyClient],
        ['storage', storageClient],
      ] as const) {
        const handler = client.config.requestHandler as typeof client.config.requestHandler & {
          httpHandlerConfigs(): { httpAgent: Agent };
        };
        expect(typeof handler.httpHandlerConfigs).toBe('function');
        const agent = handler.httpHandlerConfigs().httpAgent;
        const sockets = [...Object.values(agent.sockets), ...Object.values(agent.freeSockets)]
          .flat()
          .filter((socket): socket is Socket => socket !== undefined);
        expect(sockets.length).toBeGreaterThan(0);
        for (const socket of sockets) {
          expect(socket).toBeInstanceOf(Socket);
          expect(socket.destroyed).toBe(false);
          actualSockets.push(socket);
          socketClosures.push(
            once(socket, 'close').then(() => {
              events.push(`${name}-socket-closed`);
            }),
          );
        }
        const original = client.destroy;
        const destroy = vi.spyOn(client, 'destroy').mockImplementation(function (this: S3Client) {
          events.push(`${name}-destroy`);
          return original.call(this);
        });
        const handlerDestroy = vi.spyOn(handler, 'destroy');
        const agentDestroy = vi.spyOn(agent, 'destroy');
        destroySpies.push(destroy);
        handlerSpies.push(handlerDestroy);
        agentSpies.push(agentDestroy);
        restores.push(() => {
          destroy.mockRestore();
          handlerDestroy.mockRestore();
          agentDestroy.mockRestore();
        });
      }
      const server = app.getHttpServer<Server>();
      server.once('close', () => {
        events.push('http-server-closed');
      });
      await app.listen(0, '127.0.0.1');
      const address = server.address();
      expect(address && typeof address === 'object' && address.address).toBe('127.0.0.1');
      if (!address || typeof address === 'string') throw new Error('Owned listener did not bind');
      const response = new Promise<{ status: number | undefined; body: string }>(
        (resolve, reject) => {
          request = get(`http://127.0.0.1:${address.port}/drain`, { agent: false }, (incoming) => {
            let body = '';
            incoming.setEncoding('utf8');
            incoming.on('data', (chunk: string) => {
              body += chunk;
            });
            incoming.once('error', reject);
            incoming.once('end', () => {
              events.push('http-response-ended');
              resolve({ status: incoming.statusCode, body });
            });
          });
          request.once('error', reject);
        },
      );
      void response.catch(() => undefined);
      await bounded(requestEntered, 'request entry');
      let closeSettled = false;
      closing = app.close().then(() => {
        closeSettled = true;
        events.push('app-close-settled');
      });
      await bounded(shuttingDown, 'before shutdown');
      expect(events).toContain('module-destroy');
      expect(closeSettled).toBe(false);
      for (const destroy of destroySpies) expect(destroy).not.toHaveBeenCalled();
      resume();
      expect(await bounded(response, 'HTTP response drain')).toEqual({
        status: 200,
        body: '{"written":true}',
      });
      await bounded(closing, 'application close');
      await bounded(Promise.all(socketClosures), 'actual socket closes');
      expect(server.listening).toBe(false);
      expect(events.indexOf('actual-upload-complete')).toBeLessThan(
        events.indexOf('http-server-closed'),
      );
      for (const name of ['privacy', 'storage'])
        expect(events.indexOf('http-server-closed')).toBeLessThan(
          events.indexOf(`${name}-destroy`),
        );
      for (const destroy of [...destroySpies, ...handlerSpies, ...agentSpies])
        expect(destroy).toHaveBeenCalledTimes(1);
      for (const socket of actualSockets) expect(socket.destroyed).toBe(true);
      expect(ownedPrivacyClient(privacy)).toBe(privacyClient);
      expect(Reflect.get(storage, 'client')).toBe(storageClient);
      await expect(
        privacy.putObject({ key: drainKey, body: bytesB, contentType: 'application/zip' }),
      ).rejects.toThrow('Object store has been destroyed');
      await expect(storage.headObject(drainKey)).rejects.toThrow(
        'Storage service has been destroyed',
      );
      privacy.onApplicationShutdown();
      storage.onApplicationShutdown();
      for (const destroy of destroySpies) expect(destroy).toHaveBeenCalledTimes(1);
      console.info(
        JSON.stringify({
          scope: 'actual-owned-local-S3-Nest-drain-and-disposal',
          events,
          actualSocketCount: actualSockets.length,
          actualListener: address,
          bothActualClientsDestroyed: true,
          localProviderOnly: true,
          runtimeCustodyComplete: false,
          performanceQualified: false,
          readinessPromoting: false,
        }),
      );
    } finally {
      resume();
      request?.destroy();
      if (app) await bounded(closing ?? app.close(), 'finally application close');
      await bounded(Promise.all(socketClosures), 'actual socket closes');
      for (const restore of restores) restore();
    }
  });
});
