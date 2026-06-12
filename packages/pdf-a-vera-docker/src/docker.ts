import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface VeraPdfDockerRunRequest {
  dockerBin: string;
  image: string;
  flavour: string;
  pdf: Uint8Array;
  timeoutMs: number;
}

export interface VeraPdfDockerRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type VeraPdfDockerRunner = (
  request: VeraPdfDockerRunRequest,
) => Promise<VeraPdfDockerRunResult>;

export function buildVeraPdfDockerArgs(request: Pick<VeraPdfDockerRunRequest, 'image' | 'flavour'>) {
  return ['run', '--rm', '-i', request.image, '--format', 'json', '--flavour', request.flavour, '-'];
}

export function buildVeraPdfDockerCreateArgs(
  request: Pick<VeraPdfDockerRunRequest, 'image' | 'flavour'> & { name: string },
) {
  return [
    'create',
    '--name',
    request.name,
    request.image,
    '--format',
    'json',
    '--flavour',
    request.flavour,
    '/tmp/input.pdf',
  ];
}

export async function runVeraPdfDocker(
  request: VeraPdfDockerRunRequest,
): Promise<VeraPdfDockerRunResult> {
  const containerName = `stynx-verapdf-${randomUUID()}`;
  const inputDir = mkdtempSync(join(tmpdir(), 'stynx-verapdf-'));
  const inputPath = join(inputDir, 'input.pdf');
  writeFileSync(inputPath, Buffer.from(request.pdf));
  const create = spawnSync(
    request.dockerBin,
    buildVeraPdfDockerCreateArgs({ image: request.image, flavour: request.flavour, name: containerName }),
    { encoding: 'utf8', timeout: Math.min(request.timeoutMs, 10_000) },
  );
  if (create.error || create.status !== 0) {
    cleanupContainer(request.dockerBin, containerName);
    cleanupInputDir(inputDir);
    return {
      stdout: create.stdout ?? '',
      stderr: create.stderr || create.error?.message || '',
      exitCode: create.status,
      timedOut: create.error?.name === 'TimeoutError',
    };
  }

  const copy = spawnSync(request.dockerBin, ['cp', inputPath, `${containerName}:/tmp/input.pdf`], {
    encoding: 'utf8',
    timeout: Math.min(request.timeoutMs, 10_000),
  });
  if (copy.error || copy.status !== 0) {
    cleanupContainer(request.dockerBin, containerName);
    cleanupInputDir(inputDir);
    return {
      stdout: copy.stdout ?? '',
      stderr: copy.stderr || copy.error?.message || '',
      exitCode: copy.status,
      timedOut: copy.error?.name === 'TimeoutError',
    };
  }

  return new Promise((resolve) => {
    const child = spawn(request.dockerBin, ['start', '-a', containerName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const finish = (result: VeraPdfDockerRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanupContainer(request.dockerBin, containerName);
      cleanupInputDir(inputDir);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild(child);
      cleanupContainer(request.dockerBin, containerName);
      cleanupInputDir(inputDir);
    }, request.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      finish({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: error.message,
        exitCode: null,
        timedOut,
      });
    });
    child.on('close', (exitCode) => {
      finish({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode,
        timedOut,
      });
    });
  });
}

function killChild(child: ChildProcessWithoutNullStreams): void {
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

function cleanupContainer(dockerBin: string, containerName: string): void {
  spawnSync(dockerBin, ['rm', '-f', containerName], {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: 'ignore',
  });
}

function cleanupInputDir(inputDir: string): void {
  rmSync(inputDir, { recursive: true, force: true });
}
