import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const repoRoot = resolve(siteRoot, '..', '..');
const outDir = resolve(siteRoot, '.generated/site-docs/status');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
  });

  return {
    status: result.status ?? 1,
    stdout: stripAnsi(result.stdout || ''),
    stderr: stripAnsi(result.stderr || ''),
  };
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/gu, '');
}

function fence(value) {
  const body = value.trimEnd();
  return body.length > 0 ? `\`\`\`text\n${body}\n\`\`\`` : '_No output._';
}

function nowIso() {
  return new Date().toISOString();
}

function gitSha() {
  const result = run('git', ['rev-parse', '--short=12', 'HEAD']);
  return result.status === 0 ? result.stdout.trim() : 'unknown';
}

function page(title, description, body) {
  return `---\ntitle: ${JSON.stringify(title)}\n---\n\n# ${title}\n\n${description}\n\n- Generated at: \`${nowIso()}\`\n- Git SHA: \`${gitSha()}\`\n\n${body.trimEnd()}\n`;
}

function scorecardPage() {
  const result = run('devai', [
    'score-compute',
    '--readings-dir',
    '.devai/state/sensor-readings',
    '--view',
    'grid',
    '--no-emoji',
  ]);

  const body = [
    'This page is generated from DEVAI SensorReading summaries. A failing scorecard is published as status evidence, not as a release-readiness claim.',
    '',
    result.status === 0 || result.stdout.trim().length > 0
      ? fence(result.stdout)
      : `Scorecard generation did not produce a renderable grid.\n\n${fence(result.stderr)}`,
  ];

  return page('Scorecard', 'Current substrate-by-property status for STYNX.', body.join('\n'));
}

function testMatrixPage() {
  const result = run('devai', [
    'render-matrix',
    '--repo-root',
    '.',
    '--config',
    'scripts/test-matrix.config.json',
    '--format',
    'md',
    '--include-duration',
    '--include-thresholds',
  ]);

  const combined = [result.stdout, result.stderr].filter((part) => part.trim().length > 0).join('\n');
  const hasNoRecords = /No test-result records found/iu.test(combined);
  const rendered =
    hasNoRecords || combined.trim().length === 0
      ? '_No current test-result records found. The matrix will populate after DEVAI test-result records are emitted._'
      : result.stdout.trimEnd();

  return page(
    'Test Matrix',
    'Current test matrix render for coverage, mutation thresholds, and recorded timings.',
    rendered,
  );
}

function indexPage() {
  const body = [
    'The engineering status section publishes curated, rendered summaries. Raw evidence, local CI manifests, and coverage JSON are intentionally excluded from the public site.',
    '',
    '- [Scorecard](./scorecard)',
    '- [Test Matrix](./test-matrix)',
  ].join('\n');

  return page('Engineering Status', 'Published STYNX quality and release-status summaries.', body);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'index.md'), indexPage());
writeFileSync(resolve(outDir, 'scorecard.md'), scorecardPage());
writeFileSync(resolve(outDir, 'test-matrix.md'), testMatrixPage());
