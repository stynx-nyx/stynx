import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { computeSourceHash } from './source-hash.mjs';

const DEFAULT_MANIFEST = '.ci/evidence/local-ci.json';
const DEFAULT_REQUIRED_JOBS = ['all-linux', 'stynx-release'];
const DEFAULT_ALLOWED_PLATFORMS = ['linux/arm64', 'linux/amd64'];
const MAX_AGE_HOURS = 24;
const FORBIDDEN_EVIDENCE_PATHS = [
  '.github/workflows/',
  'scripts/evidence/',
  'infra/github/',
  '.ci/evidence/schema.json',
  '.ci/evidence/README.md',
];

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    mode: 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (
      arg === '--manifest' ||
      arg === '--mode' ||
      arg === '--actor' ||
      arg === '--trusted-actors' ||
      arg === '--event-name' ||
      arg === '--ref' ||
      arg === '--head-message' ||
      arg === '--changed-files' ||
      arg === '--github-output'
    ) {
      if (!next) {
        throw new Error(`${arg} requires a value`);
      }
      args[arg.slice(2)] = next;
      index += 1;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  process.stderr.write(`Usage: node scripts/evidence/verify-local-evidence.mjs [options]

Options:
  --mode auto|strict|gate       auto for GitHub policy, strict for local validation, gate for workflow outputs
  --manifest <path>             Evidence manifest path. Default: ${DEFAULT_MANIFEST}
  --actor <github-user>         Actor to validate against trusted actor policy
  --trusted-actors <list>       Comma, newline, semicolon, or space separated trusted actors
  --changed-files <path>        Newline separated changed file list for forbidden-path checks
  --github-output <path>        GitHub output file to receive evidence_mode=true|false
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readEvent() {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path || !existsSync(path)) return {};

  try {
    return readJson(path);
  } catch {
    return {};
  }
}

function context(args) {
  const event = readEvent();
  return {
    event,
    eventName: args['event-name'] || process.env.GITHUB_EVENT_NAME || '',
    ref: args.ref || process.env.GITHUB_REF || '',
    actor: args.actor || process.env.GITHUB_ACTOR || '',
    headMessage:
      args['head-message'] ||
      process.env.LOCAL_EVIDENCE_HEAD_MESSAGE ||
      event.head_commit?.message ||
      '',
    before: event.before || process.env.GITHUB_EVENT_BEFORE || '',
    after: event.after || process.env.GITHUB_SHA || '',
  };
}

function trailerPath(message) {
  const match = /^Local-CI-Evidence:\s*(\S+)\s*$/imu.exec(message || '');
  return match ? match[1] : '';
}

function normalizeActorList(value) {
  return (value || '')
    .split(/[\s,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllZeroSha(value) {
  return Boolean(value) && /^0+$/u.test(value);
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    return {
      ok: false,
      stdout: '',
      stderr: result.stderr.trim(),
    };
  }

  return {
    ok: true,
    stdout: result.stdout,
    stderr: '',
  };
}

function changedFiles(args, ctx) {
  if (args['changed-files']) {
    return {
      known: true,
      files: readFileSync(args['changed-files'], 'utf8').split(/\r?\n/u).filter(Boolean),
    };
  }

  if (process.env.LOCAL_EVIDENCE_CHANGED_FILES) {
    return {
      known: true,
      files: process.env.LOCAL_EVIDENCE_CHANGED_FILES.split(/\r?\n/u).filter(Boolean),
    };
  }

  if (!ctx.before || !ctx.after) {
    return {
      known: false,
      files: [],
    };
  }

  const result = isAllZeroSha(ctx.before)
    ? runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', ctx.after])
    : runGit(['diff', '--name-only', `${ctx.before}..${ctx.after}`]);

  if (!result.ok) {
    return {
      known: false,
      files: [],
      error: result.stderr,
    };
  }

  return {
    known: true,
    files: result.stdout.split(/\r?\n/u).filter(Boolean),
  };
}

function writeGithubOutput(path, evidenceMode) {
  if (!path) return;
  const line = `evidence_mode=${evidenceMode ? 'true' : 'false'}\n`;
  appendFileSync(path, line);
}

function fail(message) {
  const error = new Error(message);
  error.evidenceFailure = true;
  throw error;
}

function validateSchema(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('Manifest must be a JSON object');
  if (manifest.schemaVersion !== 1) fail('Manifest schemaVersion must be 1');
  if (typeof manifest.generatedAt !== 'string') fail('Manifest generatedAt must be a string');
  if (!manifest.sourceHash || manifest.sourceHash.algorithm !== 'sha256') {
    fail('Manifest sourceHash must use sha256');
  }
  if (!/^[a-f0-9]{64}$/u.test(manifest.sourceHash.value || '')) {
    fail('Manifest sourceHash.value must be a sha256 hex digest');
  }
  if (!Number.isInteger(manifest.sourceHash.fileCount)) {
    fail('Manifest sourceHash.fileCount must be an integer');
  }
  if (!manifest.jobs || typeof manifest.jobs !== 'object') {
    fail('Manifest jobs must be an object');
  }
  if (!manifest.tools || typeof manifest.tools !== 'object') {
    fail('Manifest tools must be an object');
  }
  if (!manifest.policy || typeof manifest.policy !== 'object') {
    fail('Manifest policy must be an object');
  }
  if (manifest.policy.maxAgeHours !== MAX_AGE_HOURS) {
    fail(`Manifest policy maxAgeHours must be ${MAX_AGE_HOURS}`);
  }
  const requiredJobs = manifest.policy.requiredJobs || [];
  if (
    requiredJobs.length !== DEFAULT_REQUIRED_JOBS.length ||
    !DEFAULT_REQUIRED_JOBS.every((job) => requiredJobs.includes(job))
  ) {
    fail(`Manifest policy requiredJobs must be ${DEFAULT_REQUIRED_JOBS.join(', ')}`);
  }
  const allowedPlatforms = manifest.policy.allowedPlatforms || [];
  if (!allowedPlatforms.length || allowedPlatforms.some((platform) => !DEFAULT_ALLOWED_PLATFORMS.includes(platform))) {
    fail(`Manifest policy allowedPlatforms must be limited to ${DEFAULT_ALLOWED_PLATFORMS.join(', ')}`);
  }
}

function validateAge(manifest, now = Date.now()) {
  const generatedAt = Date.parse(manifest.generatedAt);
  if (!Number.isFinite(generatedAt)) fail('Manifest generatedAt is not a valid timestamp');
  if (generatedAt > now + 5 * 60 * 1000) fail('Manifest generatedAt is in the future');

  const ageHours = (now - generatedAt) / (60 * 60 * 1000);
  const maxAgeHours = manifest.policy?.maxAgeHours || MAX_AGE_HOURS;
  if (ageHours > maxAgeHours) {
    fail(`Manifest is stale: ${ageHours.toFixed(2)}h old, max ${maxAgeHours}h`);
  }
}

function validateSourceHash(manifest) {
  const current = computeSourceHash();
  if (manifest.sourceHash.value !== current.value) {
    fail(`Manifest source hash mismatch: expected ${current.value}, got ${manifest.sourceHash.value}`);
  }
  if (manifest.sourceHash.fileCount !== current.fileCount) {
    fail(`Manifest source file count mismatch: expected ${current.fileCount}, got ${manifest.sourceHash.fileCount}`);
  }
}

function majorFromEngine(engine) {
  const match = />=\s*(\d+)/u.exec(engine || '');
  return match ? match[1] : '';
}

function validateTools(manifest) {
  const packageJson = readJson('package.json');
  const expectedPnpm = (packageJson.packageManager || '').startsWith('pnpm@')
    ? packageJson.packageManager.slice('pnpm@'.length)
    : '';
  const expectedNodeMajor = majorFromEngine(packageJson.engines?.node);
  const observedNode = manifest.tools.node?.observed || [];
  const observedPnpm = manifest.tools.pnpm?.observed || [];
  const observedDocker = manifest.tools.docker?.observed || [];

  if (!observedNode.length || observedNode.some((version) => !version.startsWith(`v${expectedNodeMajor}.`))) {
    fail(`Manifest node versions must all use major ${expectedNodeMajor}`);
  }
  if (!observedPnpm.length || observedPnpm.some((version) => version !== expectedPnpm)) {
    fail(`Manifest pnpm versions must all equal ${expectedPnpm}`);
  }
  if (!observedDocker.length) {
    fail('Manifest must record Docker version evidence');
  }
}

function validateJobs(manifest) {
  const requiredJobs = manifest.policy?.requiredJobs || DEFAULT_REQUIRED_JOBS;
  const allowedPlatforms = manifest.policy?.allowedPlatforms || DEFAULT_ALLOWED_PLATFORMS;

  for (const jobName of requiredJobs) {
    const job = manifest.jobs[jobName];
    if (!job) fail(`Manifest missing required job: ${jobName}`);
    if (job.result !== 'success') fail(`Manifest job ${jobName} did not succeed`);
    if (job.metadata?.job !== jobName) fail(`Manifest job ${jobName} metadata does not match`);
    if (!allowedPlatforms.includes(job.metadata?.platform)) {
      fail(`Manifest job ${jobName} used disallowed platform: ${job.metadata?.platform || ''}`);
    }
    if (!job.artifactChecksum || job.artifactChecksum.algorithm !== 'sha256') {
      fail(`Manifest job ${jobName} missing sha256 artifact checksum`);
    }
    if (!/^[a-f0-9]{64}$/u.test(job.artifactChecksum.value || '')) {
      fail(`Manifest job ${jobName} artifact checksum is invalid`);
    }
  }
}

function validateTrustedActor(args, ctx, requireTrust) {
  if (!requireTrust && !args.actor && !args['trusted-actors'] && !process.env.LOCAL_EVIDENCE_TRUSTED_ACTORS) {
    return;
  }

  const actor = args.actor || ctx.actor;
  const trustedActors = normalizeActorList(
    args['trusted-actors'] || process.env.LOCAL_EVIDENCE_TRUSTED_ACTORS || '',
  );

  if (!actor) fail('Evidence mode requires a GitHub actor');
  if (!trustedActors.length) fail('Evidence mode requires LOCAL_EVIDENCE_TRUSTED_ACTORS');
  if (!trustedActors.includes(actor)) fail(`Actor is not trusted for local evidence: ${actor}`);
}

function validateForbiddenFiles(args, ctx, requireChangedFiles) {
  const changed = changedFiles(args, ctx);
  if (!changed.known) {
    if (requireChangedFiles) {
      fail(`Unable to determine changed files for evidence policy${changed.error ? `: ${changed.error}` : ''}`);
    }
    return;
  }

  const forbidden = changed.files.filter((file) =>
    FORBIDDEN_EVIDENCE_PATHS.some((path) => file === path || file.startsWith(path)),
  );

  if (forbidden.length) {
    fail(`Evidence mode cannot be used with policy-sensitive file changes: ${forbidden.join(', ')}`);
  }
}

function validateManifest(args, ctx, options = {}) {
  if (!existsSync(args.manifest)) fail(`Missing evidence manifest: ${args.manifest}`);
  const manifest = readJson(args.manifest);

  validateSchema(manifest);
  validateAge(manifest);
  validateSourceHash(manifest);
  validateTools(manifest);
  validateJobs(manifest);
  validateTrustedActor(args, ctx, Boolean(options.requireTrust));
  validateForbiddenFiles(args, ctx, Boolean(options.requireChangedFiles));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const ctx = context(args);
  const trailer = trailerPath(ctx.headMessage);
  const isPullRequest = ctx.eventName === 'pull_request' || ctx.eventName === 'pull_request_target';
  const isMainPush = ctx.eventName === 'push' && ctx.ref === 'refs/heads/main';
  const isStrict = args.mode === 'strict';
  const isGate = args.mode === 'gate';

  if (!['auto', 'strict', 'gate'].includes(args.mode)) {
    throw new Error(`Unsupported --mode value: ${args.mode}`);
  }

  if (isStrict) {
    validateManifest(args, ctx);
    process.stdout.write('Local CI evidence is valid.\n');
    return;
  }

  if (isPullRequest) {
    writeGithubOutput(args['github-output'], false);
    process.stdout.write('Pull request evidence mode is disabled; normal CI is required.\n');
    return;
  }

  if (isMainPush && trailer) {
    if (trailer !== args.manifest) {
      fail(`Local-CI-Evidence trailer must point to ${args.manifest}, got ${trailer}`);
    }
    validateManifest(args, ctx, {
      requireTrust: true,
      requireChangedFiles: true,
    });
    writeGithubOutput(args['github-output'], true);
    process.stdout.write('Trusted local CI evidence is valid; heavy jobs may skip.\n');
    return;
  }

  writeGithubOutput(args['github-output'], false);
  process.stdout.write(
    isGate ? 'No trusted local CI evidence requested; normal CI is required.\n' : 'Normal CI is required.\n',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.evidenceFailure ? 1 : 1);
  });
}
