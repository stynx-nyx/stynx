import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const VERAPDF_IMAGE =
  'verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842';
const DOCKER_PLATFORM_ARGS = ['--platform', 'linux/amd64'] as const;
const DOCKER_ATTEMPTS = 3;

let dockerUsable: boolean | undefined;

export interface VeraPdfSummary {
  compliant: boolean;
  failedChecks: number;
  failedRules: number;
  profileName: string;
  raw: unknown;
}

export function isVeraPdfDockerUsable(): boolean {
  if (dockerUsable !== undefined) {
    return dockerUsable;
  }
  dockerUsable = Array.from({ length: DOCKER_ATTEMPTS }).some(() => {
    const result = spawnSync(
      'docker',
      ['run', '--rm', ...DOCKER_PLATFORM_ARGS, VERAPDF_IMAGE, '--version'],
      {
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    return result.status === 0;
  });
  return dockerUsable;
}

export function validatePdfA2b(pdf: Uint8Array, name: string): VeraPdfSummary {
  const dir = mkdtempSync(join(tmpdir(), 'stynx-pdf-a-'));
  const fileName = `${name}.pdf`;
  writeFileSync(join(dir, fileName), pdf);
  const result = runVeraPdf(fileName, dir);

  if (result.status !== 0) {
    throw new Error(
      `veraPDF failed for ${name}: ${result.stderr.trim() || result.stdout.trim() || 'no output'}`,
    );
  }

  const raw = JSON.parse(result.stdout) as {
    report: {
      jobs: Array<{
        validationResult: Array<{
          compliant: boolean;
          profileName: string;
          details: {
            failedChecks: number;
            failedRules: number;
          };
        }>;
      }>;
    };
  };
  const validation = raw.report.jobs[0]?.validationResult[0];
  if (!validation) {
    throw new Error(`veraPDF returned no validation result for ${name}`);
  }
  return {
    compliant: validation.compliant,
    failedChecks: validation.details.failedChecks,
    failedRules: validation.details.failedRules,
    profileName: validation.profileName,
    raw,
  };
}

function runVeraPdf(fileName: string, dir: string): ReturnType<typeof spawnSync> {
  let lastResult: ReturnType<typeof spawnSync> | undefined;
  for (let attempt = 0; attempt < DOCKER_ATTEMPTS; attempt += 1) {
    lastResult = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        ...DOCKER_PLATFORM_ARGS,
        '-v',
        `${dir}:/work`,
        '-w',
        '/work',
        VERAPDF_IMAGE,
        '--format',
        'json',
        '--flavour',
        '2b',
        fileName,
      ],
      {
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    if (lastResult.status === 0) {
      return lastResult;
    }
  }
  return lastResult ?? spawnSync('docker', ['--version'], { encoding: 'utf8' });
}
