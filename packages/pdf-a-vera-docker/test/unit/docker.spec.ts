import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVeraPdfDockerArgs, runVeraPdfDocker } from '../../src';

describe('buildVeraPdfDockerArgs', () => {
  it('constructs the stdin-based veraPDF Docker command', () => {
    const args = buildVeraPdfDockerArgs({
      image: 'verapdf/cli@sha256:test',
      flavour: '2b',
    });

    expect(args).toEqual([
      'run',
      '--rm',
      '-i',
      'verapdf/cli@sha256:test',
      '--format',
      'json',
      '--flavour',
      '2b',
      '-',
    ]);
  });
});

describe('runVeraPdfDocker', () => {
  const request = {
    dockerBin: '',
    image: 'verapdf/cli@sha256:test',
    flavour: '2b',
    pdf: new Uint8Array([1, 2, 3]),
    timeoutMs: 10_000,
  };

  it('creates, copies and starts a container then cleans both temporary resources', async () => {
    const fake = fakeDocker();
    try {
      const result = await runVeraPdfDocker({ ...request, dockerBin: fake.bin });
      expect(result).toEqual({
        stdout: '{"ok":true}',
        stderr: 'diagnostic',
        exitCode: 0,
        timedOut: false,
      });
      expect(fake.calls()).toEqual(['create', 'cp', 'start', 'rm']);
    } finally {
      rmSync(fake.root, { recursive: true, force: true });
    }
  });

  it.each([
    ['create', 'createFail', 'create failed'],
    ['copy', 'copyFail', 'copy failed'],
    ['create without stderr', 'createSilent', ''],
    ['copy without stderr', 'copySilent', ''],
  ] as const)('cleans up and returns output when Docker %s fails', async (_stage, flag, message) => {
    const fake = fakeDocker(flag);
    try {
      const result = await runVeraPdfDocker({ ...request, dockerBin: fake.bin });
      expect(result).toMatchObject({ stdout: '', stderr: message, exitCode: 1, timedOut: false });
      expect(fake.calls()).toContain('rm');
      expect(fake.calls()).not.toContain('start');
    } finally {
      rmSync(fake.root, { recursive: true, force: true });
    }
  });

  it('returns a descriptive result when Docker cannot be spawned', async () => {
    const missing = await runVeraPdfDocker({ ...request, dockerBin: '/path/that/does/not/exist' });
    expect(missing).toMatchObject({
      exitCode: null,
      timedOut: false,
      stderr: expect.stringContaining('spawnSync'),
    });
  });

  it('returns a child process launch error after the executable disappears', async () => {
    const fake = fakeDocker('deleteOnCopy');
    try {
      const result = await runVeraPdfDocker({ ...request, dockerBin: fake.bin });
      expect(result).toMatchObject({ exitCode: null, timedOut: false });
    } finally {
      rmSync(fake.root, { recursive: true, force: true });
    }
  });

  it('returns an empty stdout fallback if the executable disappears before Docker copy', async () => {
    const fake = fakeDocker('deleteOnCreate');
    try {
      const result = await runVeraPdfDocker({ ...request, dockerBin: fake.bin });
      expect(result).toMatchObject({ stdout: '', exitCode: null, timedOut: false });
      expect(fake.calls()).toEqual(['create']);
    } finally {
      rmSync(fake.root, { recursive: true, force: true });
    }
  });

  it('kills and cleans a Docker process after the run deadline', async () => {
    const fake = fakeDocker('hangOnStart');
    vi.useFakeTimers();
    try {
      const running = runVeraPdfDocker({ ...request, dockerBin: fake.bin, timeoutMs: 10_000 });
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await running;
      expect(result).toMatchObject({ exitCode: null, timedOut: true });
      expect(fake.calls()).toContain('rm');
    } finally {
      vi.useRealTimers();
      rmSync(fake.root, { recursive: true, force: true });
    }
  });
});

function fakeDocker(mode?: string) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-test-docker-'));
  const bin = join(root, 'docker');
  const log = join(root, 'calls');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const [command] = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, command + '\\n');
if (command === 'create' && ${JSON.stringify(mode)} === 'createFail') { process.stderr.write('create failed'); process.exit(1); }
if (command === 'create' && ${JSON.stringify(mode)} === 'createSilent') { process.exit(1); }
if (command === 'cp' && ${JSON.stringify(mode)} === 'copyFail') { process.stderr.write('copy failed'); process.exit(1); }
if (command === 'cp' && ${JSON.stringify(mode)} === 'copySilent') { process.exit(1); }
if (command === 'cp' && ${JSON.stringify(mode)} === 'deleteOnCopy') { fs.unlinkSync(__filename); }
if (command === 'create' && ${JSON.stringify(mode)} === 'deleteOnCreate') { fs.unlinkSync(__filename); }
if (command === 'start' && ${JSON.stringify(mode)} === 'hangOnStart') { while (true) {} }
if (command === 'start') { process.stdout.write('{"ok":true}'); process.stderr.write('diagnostic'); }
`;
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return {
    root,
    bin,
    calls: () => {
      try {
        return readFileSync(log, 'utf8').trim().split('\n');
      } catch {
        return [];
      }
    },
  };
}
