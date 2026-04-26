import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('..', import.meta.url).pathname, '..');
const perfDir = resolve(repoRoot, 'perf/k6');
const resultsDir = resolve(perfDir, 'results');
const requestedScenario = process.argv.includes('--scenario')
  ? process.argv[process.argv.indexOf('--scenario') + 1]
  : (process.env.STYNX_K6_SCENARIO || 'all');

const allScenarios = ['auth', 'crud', 'upload', 'cascade-delete'];
const scenarios = requestedScenario === 'all' ? allScenarios : [requestedScenario];
const scenarioPauseMs = Number(process.env.STYNX_K6_SCENARIO_PAUSE_MS || '0');
const waitUrl = process.env.STYNX_K6_WAIT_URL || 'http://127.0.0.1:3000';
const baseUrl = process.env.STYNX_K6_BASE_URL
  || (process.platform === 'darwin' ? 'http://host.docker.internal:3000' : 'http://127.0.0.1:3000');
const s3PublicBaseUrl = process.env.STYNX_K6_S3_PUBLIC_BASE_URL
  || (process.platform === 'darwin' ? 'http://host.docker.internal:4566' : 'http://127.0.0.1:4566');
const useHostNetwork = process.platform !== 'darwin' && process.platform !== 'win32';

function wait(ms) {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, ms);
  });
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {}
    await wait(2_000);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function runScenario(name) {
  const summaryJson = resolve(resultsDir, `${name}.summary.json`);
  const summaryHtml = resolve(resultsDir, `${name}.summary.html`);
  rmSync(summaryJson, { force: true });
  rmSync(summaryHtml, { force: true });

  const dockerArgs = [
    '--rm',
    '-v',
    `${perfDir}:/perf`,
    '-e',
    `STYNX_K6_BASE_URL=${baseUrl}`,
    '-e',
    `STYNX_K6_S3_PUBLIC_BASE_URL=${s3PublicBaseUrl}`,
    '-e',
    `K6_SUMMARY_PATH=/perf/results/${name}.summary.json`,
    '-e',
    'K6_SUMMARY_TREND_STATS=avg,min,med,max,p(90),p(95),p(99)',
    '-e',
    'K6_WEB_DASHBOARD=true',
    '-e',
    `K6_WEB_DASHBOARD_EXPORT=/perf/results/${name}.summary.html`,
  ];

  if (useHostNetwork) {
    dockerArgs.unshift('--network', 'host');
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('STYNX_K6_') && value && key !== 'STYNX_K6_BASE_URL' && key !== 'STYNX_K6_S3_PUBLIC_BASE_URL') {
      dockerArgs.push('-e', `${key}=${value}`);
    }
  }

  const result = spawnSync('docker', ['run', ...dockerArgs, 'grafana/k6:0.49.0', 'run', `/perf/${name}.js`], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`k6 scenario "${name}" failed with exit code ${result.status ?? 1}`);
  }
  for (const outputPath of [summaryJson, summaryHtml]) {
    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      throw new Error(`k6 scenario "${name}" did not produce ${outputPath}`);
    }
  }
}

async function main() {
  mkdirSync(resultsDir, { recursive: true });
  await waitFor(`${waitUrl}/healthz`, 'healthz');
  await waitFor(`${waitUrl}/readyz`, 'readyz');

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    if (!allScenarios.includes(scenario)) {
      throw new Error(`Unsupported scenario "${scenario}"`);
    }
    runScenario(scenario);
    if (scenarioPauseMs > 0 && index < scenarios.length - 1) {
      await wait(scenarioPauseMs);
    }
  }
}

await main();
