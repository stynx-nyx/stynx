import { spawnSync } from 'node:child_process';

let cached: boolean | undefined;

export function isVeraPdfDockerUsable(): boolean {
  if (cached !== undefined) {
    return cached;
  }
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  cached = result.status === 0;
  return cached;
}
