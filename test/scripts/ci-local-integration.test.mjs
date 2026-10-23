import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import test from 'node:test';

const runner = resolve(import.meta.dirname, '../../scripts/ci-local/inside.sh');

// Execute the production shell entrypoint. Only its external commands are doubled;
// the job's control flow, environment, status handling and cleanup remain real.
const commandDouble = String.raw`
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const root = process.env.STYNX_CI_ORDER_FIXTURE;
const state = join(root, 'schema');
function stage(name) {
  appendFileSync(join(root, 'events'), name + '\n');
  if (process.env.STYNX_CI_FAIL_STAGE === name) process.exit(43);
}
if (command === 'git') process.exit(0);
if (args.includes('--version') || (command === 'docker' && args[0] === 'compose')) {
  console.log('fixture-tool');
  process.exit(0);
}
if (command === 'docker') {
  if (args[0] === 'port') console.log('127.0.0.1:5432');
  if (args[0] === 'rm') stage('cleanup');
  if (args[0] === 'logs') stage('logs');
} else if (command === 'pg_isready') {
  process.exit(0);
} else if (command === 'node' && args[1] === 'migrate') {
  stage('migrate');
  writeFileSync(state, 'platform');
} else if (command === 'bash' && args[0] === 'scripts/db-reset.sh') {
  stage('reset');
  writeFileSync(state, 'bootstrap');
} else if (command === 'pnpm') {
  if (args[0] === 'db:verify') stage('verify');
  else if (args[0] === 'check:rls-smoke') {
    stage('smoke');
    if (!existsSync(state) || readFileSync(state, 'utf8') !== 'platform') {
      console.error('platform storage.documents is missing at the live RLS gate');
      process.exit(42);
    }
  } else if (args.slice(0, 4).join(' ') === 'exec turbo run test:int') {
    stage('integration');
    if (!args.includes('--concurrency=1')) process.exit(44);
  } else if (!['config', 'install', '--filter'].includes(args[0])) {
    throw new Error('Unexpected pnpm command: ' + args.join(' '));
  }
} else {
  throw new Error('Unexpected command: ' + command + ' ' + args.join(' '));
}
`;

function runIntegration(failingStage = '') {
  const fixture = mkdtempSync(join(tmpdir(), 'stynx-ci-integration-'));
  const bin = join(fixture, 'bin');
  mkdirSync(bin);
  const executable = join(bin, 'command.mjs');
  writeFileSync(executable, `#!${process.execPath}\n${commandDouble}`, { mode: 0o755 });
  for (const command of ['bash', 'docker', 'git', 'node', 'pg_isready', 'pnpm']) {
    symlinkSync(executable, join(bin, command));
  }
  writeFileSync(join(fixture, 'events'), '');
  try {
    const result = spawnSync('/bin/bash', [runner, 'integration'], {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 15_000,
      env: {
        PATH: `${bin}${delimiter}/usr/bin${delimiter}/bin`,
        HOME: fixture,
        WORKSPACE: fixture,
        CI_LOCAL_ARTIFACT_DIR: join(fixture, 'artifacts'),
        CI_LOCAL_FILTER_KNOWN_NOISE: '0',
        CI_LOCAL_MIN_FREE_KB: '0',
        STYNX_CI_ORDER_FIXTURE: fixture,
        STYNX_CI_FAIL_STAGE: failingStage,
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return {
      ...result,
      events: readFileSync(join(fixture, 'events'), 'utf8').trim().split('\n'),
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

const gates = ['migrate', 'verify', 'smoke', 'reset', 'integration'];

test('local integration verifies migrated platform RLS before destructive bootstrap reset', () => {
  const result = runIntegration();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.events, ['cleanup', ...gates, 'logs', 'cleanup']);
});

for (const [index, gate] of gates.entries()) {
  test(`local integration preserves ${gate} failure and cleans up without running later gates`, () => {
    const result = runIntegration(gate);
    assert.equal(result.status, 43, result.stderr);
    assert.deepEqual(result.events, ['cleanup', ...gates.slice(0, index + 1), 'logs', 'cleanup']);
  });
}
