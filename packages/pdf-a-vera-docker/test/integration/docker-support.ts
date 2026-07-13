import { spawnSync } from 'node:child_process';
import { VeraPdfDockerValidator } from '../../src';

// Per-attempt container budget. Kept well under the 420s vitest testTimeout
// so a hung container (the emulated amd64 JVM intermittently aborts under
// qemu and the container then idles at 0% CPU) fails the attempt via the
// runner's own timeout — which force-removes the container — instead of
// vitest killing the test and leaking it. The vitest-level retry then gets a
// fresh container. Healthy runs finish in ~15s.
const INTEGRATION_VERAPDF_TIMEOUT_MS = 120_000;

export function makeIntegrationValidator(): VeraPdfDockerValidator {
  return new VeraPdfDockerValidator({ timeoutMs: INTEGRATION_VERAPDF_TIMEOUT_MS });
}

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
