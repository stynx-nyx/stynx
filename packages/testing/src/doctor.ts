import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export interface DoctorRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runDoctorForApp(cwd: string): Promise<DoctorRunResult> {
  const repoRoot = resolve(cwd);
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [resolve(repoRoot, 'scripts/stynx-doctor.mjs')], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
