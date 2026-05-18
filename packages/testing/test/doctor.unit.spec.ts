import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { runDoctorForApp } from '../src/doctor';
import type { Mock } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

function mockChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  (spawn as Mock).mockReturnValue(child);
  return child;
}

describe('runDoctorForApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns exit code and captured output from the doctor process', async () => {
    const child = mockChildProcess();
    const result = runDoctorForApp('/tmp/stynx-app');

    child.stdout.emit('data', Buffer.from('ok\n'));
    child.stderr.emit('data', Buffer.from('warn\n'));
    child.emit('close', 0);

    await expect(result).resolves.toEqual({
      exitCode: 0,
      stdout: 'ok\n',
      stderr: 'warn\n',
    });
    expect(spawn).toHaveBeenCalledWith(
      'node',
      ['/tmp/stynx-app/scripts/stynx-doctor.mjs'],
      expect.objectContaining({
        cwd: '/tmp/stynx-app',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  });

  it('defaults a null close code to failure', async () => {
    const child = mockChildProcess();
    const result = runDoctorForApp('/tmp/stynx-app');

    child.emit('close', null);

    await expect(result).resolves.toMatchObject({ exitCode: 1 });
  });

  it('rejects when process spawning fails', async () => {
    const child = mockChildProcess();
    const result = runDoctorForApp('/tmp/stynx-app');

    child.emit('error', new Error('spawn failed'));

    await expect(result).rejects.toThrow('spawn failed');
  });
});
