import { spawnSync } from 'node:child_process';
import { DEFAULT_VERAPDF_IMAGE } from '../../src';

let cached: boolean | undefined;

export function isVeraPdfDockerUsable(): boolean {
  if (cached !== undefined) {
    return cached;
  }
  const result = spawnSync('docker', ['run', '--rm', DEFAULT_VERAPDF_IMAGE, '--version'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  cached = result.status === 0;
  return cached;
}
