import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function runDoctor(cwd: string): { exitCode: number; stdout: string; stderr: string } {
  const doctor = spawnSync('node', [resolve(cwd, 'scripts/stynx-doctor.mjs')], {
    cwd,
    encoding: 'utf8',
  });
  return {
    exitCode: doctor.status ?? 2,
    stdout: doctor.stdout ?? '',
    stderr: doctor.stderr ?? '',
  };
}
