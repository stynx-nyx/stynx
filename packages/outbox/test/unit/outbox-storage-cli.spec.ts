import { resolve, join } from 'node:path';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const harness = vi.hoisted(() => {
  const client = { connect: vi.fn(), query: vi.fn(), end: vi.fn() };
  return { client, create: vi.fn(() => client), verify: vi.fn() };
});
vi.mock('@stynx-nyx/data', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  createStynxPgClient: harness.create,
}));
vi.mock('../../src/storage', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  verifyOutboxStorage: harness.verify,
}));
import { runOutboxStorageCommand, storageCommandExecution } from '../../src/storage-cli';

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: {
        write: (chunk: string | Uint8Array) => {
          stdout.push(String(chunk));
          return true;
        },
      },
      stderr: {
        write: (chunk: string | Uint8Array) => {
          stderr.push(String(chunk));
          return true;
        },
      },
    },
  };
}
const secretUrl = 'postgresql://owner:private-cli-password@localhost/storage';

// The same callable boundary drives the real packed executable; subprocess
// PostgreSQL tests independently prove its actual catalog/refusal behavior.
describe('outbox storage command boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.client.connect.mockReset().mockResolvedValue(undefined);
    harness.client.query.mockReset().mockResolvedValue({ rows: [] });
    harness.client.end.mockReset().mockResolvedValue(undefined);
    harness.verify.mockReset().mockResolvedValue({ supported: true, checks: [] });
  });

  it('imports without executing a command and renders default storage entirely offline', async () => {
    expect(storageCommandExecution).toBe(undefined);
    const capture = output();
    await expect(
      runOutboxStorageCommand(['--render'], { STYNX_STORAGE_DATABASE_URL: secretUrl }, capture.io),
    ).resolves.toBe(0);
    expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
      binding: { ownerRole: 'stynx_owner', appRole: 'stynx_app', readerRole: 'stynx_reader' },
    });
    expect(capture.stderr).toEqual([]);
    expect(harness.create).not.toHaveBeenCalled();
    expect(capture.stdout.join('')).not.toContain(secretUrl);
  });

  it.each([['--reader-role', 'consumer_reader'], ['--no-reader']])(
    'renders exact custom tenant and reader binding: %j',
    async (...reader) => {
      const capture = output();
      const args = [
        '--render',
        '--owner-role',
        'consumer_owner',
        '--app-role',
        'role_app_backend',
        '--tenant-schema',
        'auth',
        '--tenant-table',
        'tenants',
        '--tenant-column',
        'tenant_uuid',
        ...reader,
      ];
      await expect(runOutboxStorageCommand(args, {}, capture.io)).resolves.toBe(0);
      expect(JSON.parse(capture.stdout.join(''))).toMatchObject({
        binding: {
          ownerRole: 'consumer_owner',
          appRole: 'role_app_backend',
          readerRole: reader[0] === '--no-reader' ? null : 'consumer_reader',
          tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
        },
      });
      expect(harness.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['reader conflict', ['--render', '--reader-role', 'reader', '--no-reader']],
    ['incomplete tenant', ['--render', '--tenant-schema', 'auth']],
    ['invalid identifier', ['--render', '--owner-role', 'private-cli-password;drop schema outbox']],
    ['unknown option', ['--private-cli-password']],
    ['positional argument', ['private-cli-password']],
    ['invalid environment key', ['--database-url-env', 'private-cli-password']],
    ['missing environment value', []],
  ])('refuses %s before acquiring a database connection', async (_label, args) => {
    const capture = output();
    await expect(runOutboxStorageCommand(args, {}, capture.io)).resolves.toBe(1);
    expect(capture.stdout).toEqual([]);
    expect(JSON.parse(capture.stderr.join(''))).toMatchObject({
      supported: false,
      error: 'Outbox storage verification refused',
    });
    expect(capture.stderr.join('')).not.toContain('private-cli-password');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'returns the observed supported=%s result and always rolls back/disconnects',
    async (supported) => {
      const capture = output();
      harness.verify.mockResolvedValueOnce({
        supported,
        checks: [{ id: 'real-check', status: supported ? 'pass' : 'fail' }],
      });
      await expect(
        runOutboxStorageCommand(
          ['--database-url-env', 'CONSUMER_DATABASE'],
          { CONSUMER_DATABASE: secretUrl },
          capture.io,
        ),
      ).resolves.toBe(supported ? 0 : 1);
      expect(harness.create).toHaveBeenCalledWith({ connectionString: secretUrl });
      expect(harness.client.connect).toHaveBeenCalledTimes(1);
      expect(harness.client.query.mock.calls).toEqual([['begin read only'], ['rollback']]);
      expect(harness.verify).toHaveBeenCalledWith(harness.client, {});
      expect(harness.client.end).toHaveBeenCalledTimes(1);
      expect(JSON.parse(capture.stdout.join(''))).toEqual({
        supported,
        checks: [{ id: 'real-check', status: supported ? 'pass' : 'fail' }],
      });
      expect(capture.stdout.join('') + capture.stderr.join('')).not.toContain(
        'private-cli-password',
      );
    },
  );

  it.each([
    [{ code: '42501' }, '42501'],
    [{ code: 'private-cli-password' }, 'STORAGE_VERIFICATION_UNAVAILABLE'],
    [{ code: 42 }, 'STORAGE_VERIFICATION_UNAVAILABLE'],
    [new Error('private-cli-password'), 'STORAGE_VERIFICATION_UNAVAILABLE'],
    [null, 'STORAGE_VERIFICATION_UNAVAILABLE'],
  ])(
    'sanitizes verification failures while preserving safe diagnostic codes: %j',
    async (failure, code) => {
      const capture = output();
      harness.verify.mockRejectedValueOnce(failure);
      await expect(
        runOutboxStorageCommand([], { STYNX_STORAGE_DATABASE_URL: secretUrl }, capture.io),
      ).resolves.toBe(1);
      expect(capture.stdout).toEqual([]);
      expect(JSON.parse(capture.stderr.join(''))).toEqual({
        supported: false,
        error: 'Outbox storage verification refused',
        code,
      });
      expect(capture.stderr.join('')).not.toContain('private-cli-password');
      expect(harness.client.query.mock.calls).toEqual([['begin read only'], ['rollback']]);
      expect(harness.client.end).toHaveBeenCalledTimes(1);
    },
  );

  it('disconnects after connection refusal even when rollback cannot execute', async () => {
    const capture = output();
    harness.client.connect.mockRejectedValueOnce(
      Object.assign(new Error('private-cli-password'), { code: 'ECONNREFUSED' }),
    );
    harness.client.query.mockRejectedValueOnce(new Error('connection unavailable'));
    await expect(
      runOutboxStorageCommand([], { STYNX_STORAGE_DATABASE_URL: secretUrl }, capture.io),
    ).resolves.toBe(1);
    expect(JSON.parse(capture.stderr.join(''))).toMatchObject({
      supported: false,
      code: 'ECONNREFUSED',
    });
    expect(harness.verify).not.toHaveBeenCalled();
    expect(harness.client.query.mock.calls).toEqual([['rollback']]);
    expect(harness.client.end).toHaveBeenCalledTimes(1);
    expect(capture.stderr.join('')).not.toContain('private-cli-password');
  });

  it('does not run the executable when an embedding process has no script entry', async () => {
    const originalArgv = process.argv;
    try {
      process.argv = [process.execPath];
      vi.resetModules();
      const embedded = await import('../../src/storage-cli');
      expect(embedded.storageCommandExecution).toBe(undefined);
      expect(harness.create).not.toHaveBeenCalled();
    } finally {
      process.argv = originalArgv;
    }
  });

  it.each(['direct', 'symlink'])(
    'the actual %s executable entry invokes the same command and records its exit status',
    async (mode) => {
      const originalArgv = process.argv;
      const originalExitCode = process.exitCode;
      const directory = mkdtempSync(join(tmpdir(), 'stynx command á-'));
      const direct = resolve(__dirname, '../../src/storage-cli.ts');
      const linked = join(directory, 'storage-command.ts');
      symlinkSync(direct, linked);
      const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      try {
        process.argv = [process.execPath, mode === 'symlink' ? linked : direct, '--render'];
        vi.resetModules();
        const executable = await import('../../src/storage-cli');
        await expect(executable.storageCommandExecution).resolves.toBe(0);
        expect(process.exitCode).toBe(0);
        expect(JSON.parse(String(write.mock.calls[0]![0]))).toMatchObject({
          binding: { appRole: 'stynx_app' },
        });
        expect(harness.create).not.toHaveBeenCalled();
      } finally {
        process.argv = originalArgv;
        process.exitCode = originalExitCode;
        write.mockRestore();
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
