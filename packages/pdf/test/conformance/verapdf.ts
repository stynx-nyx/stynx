import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const VERAPDF_IMAGE =
  'verapdf/cli@sha256:20202b4bcc2410a25db1f637c7b461a2e0dda1d97dd8a6df658286b30d56c842';
export const VERAPDF_CONFORMANCE_TIMEOUT_MS = 420_000;
const DOCKER_PLATFORM_ARGS = ['--platform', 'linux/amd64'] as const;
// The veraPDF image is linux/amd64 only, emulated via qemu on the local
// arm64 Docker VM. The emulated JVM intermittently aborts (qemu signal 6)
// and the container then hangs forever at 0% CPU — no timeout is long
// enough for that, so each container gets a bounded attempt and a hang is
// retried with a fresh container. Healthy containers finish in ~15s
// (~90s observed under load); ATTEMPTS × RUN_TIMEOUT stays below
// VERAPDF_CONFORMANCE_TIMEOUT_MS so the harness error surfaces before
// vitest kills the test. turbo.json additionally serializes this suite
// against pdf-a-vera-docker's so two emulated JVMs never compete for the
// 4-CPU/6GB VM.
const DOCKER_ATTEMPTS = 3;
const DOCKER_POLL_INTERVAL_MS = 500;
const VERAPDF_RUN_TIMEOUT_MS = 120_000;

let dockerUsable: boolean | undefined;

interface DockerRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface DockerCopyFile {
  source: string;
  target: string;
}

export interface VeraPdfSummary {
  compliant: boolean;
  failedChecks: number;
  failedRules: number;
  profileName: string;
  raw: unknown;
}

export interface VeraPdfInput {
  name: string;
  pdf: Uint8Array;
}

export function isVeraPdfDockerUsable(): boolean {
  if (dockerUsable !== undefined) {
    return dockerUsable;
  }
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  dockerUsable = result.status === 0;
  return dockerUsable;
}

export function validatePdfA2b(pdf: Uint8Array, name: string): VeraPdfSummary {
  return validatePdfsA2b([{ name, pdf }])[0]!;
}

export function validatePdfsA2b(inputs: VeraPdfInput[]): VeraPdfSummary[] {
  const dir = mkdtempSync(join(process.cwd(), '.stynx-pdf-a-'));
  const fileNames = inputs.map((input) => `${input.name}.pdf`);
  try {
    inputs.forEach((input, index) => {
      writeFileSync(join(dir, fileNames[index]!), input.pdf);
    });
    const result = runVeraPdf(fileNames, dir);

    if (result.status !== 0) {
      throw new Error(`veraPDF failed for ${fileNames.join(', ')}: ${dockerResultMessage(result)}`);
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
    return inputs.map((input, index) => {
      const validation = raw.report.jobs[index]?.validationResult[0];
      if (!validation) {
        throw new Error(`veraPDF returned no validation result for ${input.name}`);
      }
      return {
        compliant: validation.compliant,
        failedChecks: validation.details.failedChecks,
        failedRules: validation.details.failedRules,
        profileName: validation.profileName,
        raw,
      };
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runVeraPdf(fileNames: string[], dir: string): DockerRunResult {
  let lastResult: DockerRunResult | undefined;
  for (let attempt = 0; attempt < DOCKER_ATTEMPTS; attempt += 1) {
    const containerFiles = fileNames.map((fileName) => `/tmp/${fileName}`);
    lastResult = runDockerVeraPdf(
      [
        '--format',
        'json',
        '--flavour',
        '2b',
        ...containerFiles,
      ],
      fileNames[0] ?? 'validation',
      VERAPDF_RUN_TIMEOUT_MS,
      fileNames.map((fileName) => ({
        source: join(dir, fileName),
        target: `/tmp/${fileName}`,
      })),
    );
    if (lastResult.status === 0) {
      return lastResult;
    }
  }
  return lastResult ?? toDockerRunResult(spawnSync('docker', ['--version'], { encoding: 'utf8' }));
}

function runDockerVeraPdf(
  veraPdfArgs: string[],
  label: string,
  timeout: number,
  copyFiles: DockerCopyFile[],
): DockerRunResult {
  const containerName = `stynx-verapdf-${safeLabel(label)}-${randomUUID()}`;
  const create = spawnSync(
    'docker',
    ['create', '--name', containerName, ...DOCKER_PLATFORM_ARGS, VERAPDF_IMAGE, ...veraPdfArgs],
    {
      encoding: 'utf8',
    },
  );
  if (create.status !== 0 || create.error) {
    cleanupContainer(containerName);
    return toDockerRunResult(create);
  }

  for (const copyFile of copyFiles) {
    const copy = spawnSync('docker', ['cp', copyFile.source, `${containerName}:${copyFile.target}`], {
      encoding: 'utf8',
    });
    if (copy.status !== 0 || copy.error) {
      cleanupContainer(containerName);
      return toDockerRunResult(copy);
    }
  }

  const start = spawnSync('docker', ['start', containerName], { encoding: 'utf8' });
  if (start.status !== 0 || start.error) {
    const result = toDockerRunResult(start);
    cleanupContainer(containerName);
    return result;
  }

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = inspectContainer(containerName);
    if (!state.running) {
      const logs = containerLogs(containerName);
      cleanupContainer(containerName);
      return { status: state.exitCode, stdout: logs.stdout, stderr: logs.stderr };
    }
    sleep(DOCKER_POLL_INTERVAL_MS);
  }

  cleanupContainer(containerName);
  return {
    status: null,
    stdout: '',
    stderr: '',
    error: new Error(`Docker container ${containerName} exceeded ${timeout}ms`),
  };
}

function safeLabel(label: string): string {
  return label.replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 40) || 'run';
}

function dockerResultMessage(result: DockerRunResult): string {
  if (result.error) {
    return result.error.message;
  }
  return result.stderr.trim() || result.stdout.trim() || 'no output';
}

function inspectContainer(containerName: string): { running: boolean; exitCode: number | null } {
  const result = spawnSync(
    'docker',
    ['inspect', '--format', '{{.State.Running}} {{.State.ExitCode}}', containerName],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    return { running: false, exitCode: result.status };
  }
  const [running, exitCode] = result.stdout.trim().split(/\s+/, 2);
  return {
    running: running === 'true',
    exitCode: exitCode === undefined ? null : Number(exitCode),
  };
}

function containerLogs(containerName: string): { stdout: string; stderr: string } {
  const result = spawnSync('docker', ['logs', containerName], { encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function cleanupContainer(containerName: string): void {
  spawnSync('docker', ['rm', '-f', containerName], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
}

function toDockerRunResult(result: ReturnType<typeof spawnSync>): DockerRunResult {
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error ? { error: result.error } : {}),
  };
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
