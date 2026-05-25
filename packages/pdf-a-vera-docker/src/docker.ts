import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

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

export async function runVeraPdfDocker(
  request: VeraPdfDockerRunRequest,
): Promise<VeraPdfDockerRunResult> {
  return new Promise((resolve) => {
    const child = spawn(request.dockerBin, buildVeraPdfDockerArgs(request), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let settled = false;

    const finish = (result: VeraPdfDockerRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild(child);
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

    child.stdin.end(Buffer.from(request.pdf));
  });
}

function killChild(child: ChildProcessWithoutNullStreams): void {
  if (!child.killed) {
    child.kill('SIGKILL');
  }
}
