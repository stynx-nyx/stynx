// vi.hoisted bundle: declarations referenced by vi.mock factories must be
// hoisted alongside the mock call (Vitest only hoists vi.mock + vi.hoisted).
const { stop, connect, end, query, close, init, get, FakeContainer } = vi.hoisted(() => {
    const stop = vi.fn(async () => undefined);
    const connect = vi.fn(async () => undefined);
    const end = vi.fn(async () => undefined);
    const query = vi.fn(async (_sql?: unknown, _params?: unknown[]) => ({ rows: [] }));
    const tx = vi.fn(async (callback: (trx: unknown) => Promise<unknown>) => callback({}));
    const withSystemContext = vi.fn(
      async (_label: string, callback: () => Promise<unknown>) => callback(),
    );
    const close = vi.fn(async () => undefined);
    const init = vi.fn(async () => undefined);
    const get = vi.fn((token: unknown) => {
      if (typeof token === 'function' && token.name === 'Database') {
        return { withSystemContext, tx };
      }
      return { runWithRequestContext: vi.fn() };
    });
    class FakeContainer {
      constructor(readonly image: string) {}
      withEnvironment() {
        return this;
      }
      withExposedPorts() {
        return this;
      }
      withWaitStrategy() {
        return this;
      }
      async start() {
        return {
          stop,
          getHost: () => '127.0.0.1',
          getMappedPort: (port: number) => port + 10_000,
        };
      }
    }
    return { stop, connect, end, query, tx, withSystemContext, close, init, get, FakeContainer };
  });

vi.mock('testcontainers', () => ({
  GenericContainer: FakeContainer,
  Wait: {
    forLogMessage: vi.fn(() => 'log-wait'),
    forListeningPorts: vi.fn(() => 'port-wait'),
  },
}));

vi.mock('@nestjs/testing', () => ({
  Test: {
    createTestingModule: vi.fn(() => ({
      compile: vi.fn(async () => ({
        createNestApplication: () => ({ init, close }),
        get,
      })),
    })),
  },
}));

vi.mock('@stynx/data', () => ({
  createStynxPgClient: vi.fn(() => ({ connect, query, end })),
  Database: class Database {},
  StynxDataModule: {
    forRoot: vi.fn((options) => ({ module: 'StynxDataModule', options })),
  },
}));

vi.mock('@stynx/core', () => ({
  RequestContextMutator: class RequestContextMutator {},
}));

import { createTestApp } from '../src/create-test-app';
import type { TestSqlStep } from '../src/types';

describe('createTestApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts optional services, applies SQL steps, exposes tx/admin helpers, and tears down', async () => {
    const sqlStep: TestSqlStep = async (client) => {
      await client.query('select 2');
    };
    class ExtraModule {}
    const app = await createTestApp({
      localstack: { enabled: false },
      cognito: { enabled: true, image: 'cognito-test:latest' },
      migrations: ['select 1', sqlStep],
      seeds: ['select 3'],
      overrides: {
        controllers: [class DemoController {}],
        providers: [{ provide: 'demo', useValue: true }],
        imports: [{ module: ExtraModule }],
      },
    });

    expect(connect).toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('select 1');
    expect(query).toHaveBeenCalledWith('select 2');
    expect(query).toHaveBeenCalledWith('select 3');
    await expect(app.tx(async () => 'ok')).resolves.toBe('ok');
    const admin = await app.adminClient();
    expect(admin).toEqual({ connect, query, end });
    await app.teardown();
    expect(close).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('uses default LocalStack services and omits Cognito when disabled', async () => {
    const app = await createTestApp();

    expect(app.localstack).toEqual(
      expect.objectContaining({
        endpoint: 'http://127.0.0.1:14566',
        region: 'us-east-1',
      }),
    );
    expect(app.cognito).toBeUndefined();
    await app.teardown();
  });

  it('applies seed-only SQL setup without requiring migrations', async () => {
    const app = await createTestApp({
      localstack: { enabled: false },
      seeds: ['select seed_only'],
    });

    expect(query).toHaveBeenCalledWith('select seed_only');
    await app.teardown();
  });

  it('stops started containers when app initialization fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));

    await expect(createTestApp({ cognito: { enabled: true } })).rejects.toThrow('init failed');
    expect(close).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('preserves the initialization error when cleanup also fails', async () => {
    init.mockRejectedValueOnce(new Error('init failed'));
    close.mockRejectedValueOnce(new Error('close failed'));
    stop
      .mockRejectedValueOnce(new Error('cognito stop failed'))
      .mockRejectedValueOnce(new Error('localstack stop failed'))
      .mockRejectedValueOnce(new Error('redis stop failed'))
      .mockRejectedValueOnce(new Error('postgres stop failed'));

    await expect(createTestApp({ cognito: { enabled: true } })).rejects.toThrow('init failed');
    expect(close).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(4);
  });
});
