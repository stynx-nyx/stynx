import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { collectLegacyK6Baseline } from '../../../scripts/lib/k6-baseline-collector.mjs';

// Explicit external fetch fixture. It grants no authentication/native standing;
// retained acquisition is produced by the real collector, never an owned stub.
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
export const token = 'inspector-association-external-token';
export const signed = 'https://fixture.blob.core.windows.net/job.log?sig=external-secret';
const repository = () => ({ id: 1221320856, full_name: 'stynx-nyx/stynx' });
export const uploadAction = 'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a';
const expression =
  "k6-results-${{ github.event_name == 'workflow_dispatch' && inputs.scenario || 'all' }}";
const workflowBytes = Buffer.from(
  `name: Hardening\non: workflow_dispatch\nenv:\n  K6_ARTIFACT_NAME: "${expression}"\njobs:\n  k6:\n    name: k6\n    runs-on: ubuntu-latest\n    steps:\n      - name: Prepare\n        run: echo preparing\n      - name: Run isolated k6 scenarios\n        run: node scripts/never-executed.mjs\n        env:\n          K6_PROFILE: hardening\n      - name: Upload k6 artifacts\n        uses: ${uploadAction}\n        with:\n          name: '\${{ env.K6_ARTIFACT_NAME }}'\n          path: test/perf/k6/results\n          if-no-files-found: error\n`,
);
function run(current = false) {
  return {
    id: current ? 900 : 500,
    run_attempt: 1,
    run_number: current ? 900 : 500,
    head_sha: (current ? 'c' : 'a').repeat(40),
    head_branch: 'main',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
    created_at: `2020-01-${current ? '02' : '01'}T10:00:00Z`,
    run_started_at: `2020-01-${current ? '02' : '01'}T10:00:01Z`,
    updated_at: `2020-01-${current ? '02' : '01'}T10:02:00Z`,
    repository: repository(),
    head_repository: repository(),
    workflow_id: 266480675,
    path: '.github/workflows/hardening.yml',
  };
}
function archive() {
  const localParts = [],
    centralParts = [];
  let offset = 0;
  const members = ['auth', 'crud', 'upload', 'cascade-delete'].flatMap((scenario) => [
    {
      name: `${scenario}.summary.json`,
      bytes: Buffer.from(
        JSON.stringify({ metrics: { duration: { values: { 'p(95)': 12, 'p(99)': 14 } } } }),
      ),
    },
    { name: `${scenario}.summary.html`, bytes: Buffer.from(`<html>${scenario}</html>`) },
  ]);
  for (const { name: text, bytes } of members) {
    const name = Buffer.from(text),
      local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(10, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(10, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0x20, 38);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, bytes);
    centralParts.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const central = Buffer.concat(centralParts),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}
export function associationTransport({
  hooks = {},
  jobCount = 1,
  artifactCount = 1,
  runCount = 1,
} = {}) {
  const body = archive();
  const artifact = {
    id: 301,
    name: 'k6-results-all',
    expired: false,
    digest: `sha256:${hash(body)}`,
    size_in_bytes: body.length,
    created_at: '2020-01-01T10:01:00Z',
    updated_at: '2020-01-01T10:01:01Z',
    expires_at: '2099-01-01T10:00:00Z',
    workflow_run: {
      id: 500,
      repository_id: 1221320856,
      head_repository_id: 1221320856,
      head_branch: 'main',
      head_sha: 'a'.repeat(40),
    },
  };
  const step = (name, number, started_at, completed_at) => ({
    name,
    number,
    started_at,
    completed_at,
    status: 'completed',
    conclusion: 'success',
  });
  const job = {
    id: 701,
    run_id: 500,
    run_attempt: 1,
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    run_url: 'https://api.github.com/repos/stynx-nyx/stynx/actions/runs/500',
    url: 'https://api.github.com/repos/stynx-nyx/stynx/actions/jobs/701',
    status: 'completed',
    conclusion: 'success',
    name: 'k6',
    workflow_name: 'Hardening',
    started_at: '2020-01-01T10:00:01Z',
    completed_at: '2020-01-01T10:01:59Z',
    steps: [
      step('Prepare', 1, '2020-01-01T10:00:02Z', '2020-01-01T10:00:03Z'),
      step('Run isolated k6 scenarios', 2, '2020-01-01T10:00:03Z', '2020-01-01T10:01:00Z'),
      step('Upload k6 artifacts', 3, '2020-01-01T10:01:00Z', '2020-01-01T10:01:30Z'),
    ],
  };
  const logLines = [
    "2020-01-01T10:00:01.0000000Z Current runner version: 'fixture-1'",
    `2020-01-01T10:01:00.1000000Z ##[group]Run ${uploadAction}`,
    '2020-01-01T10:01:00.1100000Z   name: k6-results-all',
    '2020-01-01T10:01:00.1200000Z   path: test/perf/k6/results',
    '2020-01-01T10:01:00.1300000Z   if-no-files-found: error',
    '2020-01-01T10:01:00.1400000Z   K6_ARTIFACT_NAME: k6-results-all',
    '2020-01-01T10:01:00.1500000Z ##[endgroup]',
    `2020-01-01T10:01:01.0000000Z Uploaded bytes ${body.length}`,
    `2020-01-01T10:01:02.0000000Z SHA256 digest of uploaded artifact is ${hash(body)}`,
    '2020-01-01T10:01:03.0000000Z Artifact k6-results-all successfully finalized. Artifact ID 301',
    `2020-01-01T10:01:04.0000000Z Artifact k6-results-all has been successfully uploaded! Final size is ${body.length} bytes. Artifact ID is 301`,
    '2020-01-01T10:01:05.0000000Z Artifact download URL: https://github.com/stynx-nyx/stynx/actions/runs/500/artifacts/301',
    '2020-01-01T10:01:31.0000000Z Post job cleanup.',
    '2020-01-01T10:01:58.0000000Z Cleaning up orphan processes',
  ];
  const log = Buffer.from(`${logLines.join('\n')}\n`);
  const runs = [
    run(),
    ...Array.from({ length: runCount - 1 }, (_, index) => ({
      ...run(),
      id: 1000 + index,
      conclusion: 'failure',
    })),
  ];
  const jobs = [
    job,
    ...Array.from({ length: jobCount - 1 }, (_, index) => ({
      ...clone(job),
      id: 1000 + index,
      name: `unrelated-${index}`,
      url: `https://api.github.com/repos/stynx-nyx/stynx/actions/jobs/${1000 + index}`,
    })),
  ];
  const artifacts = [
    artifact,
    ...Array.from({ length: artifactCount - 1 }, (_, index) => ({
      id: 1000 + index,
      name: `unrelated-${index}`,
    })),
  ];
  const counts = new Map(),
    calls = [],
    raw = new Map();
  const count = (name) => {
    const value = (counts.get(name) ?? 0) + 1;
    counts.set(name, value);
    return value;
  };
  const phase = (name) => `${name}-${count(name) === 1 ? 'before' : 'after'}`;
  async function fetchImpl(url, options) {
    const parsed = new URL(url);
    let name, value;
    if (url === signed) {
      assert.equal(Object.hasOwn(options.headers, 'Authorization'), false);
      name = phase('log');
      value = log;
    } else {
      assert.equal(parsed.origin, 'https://api.github.com');
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      const path = parsed.pathname.replace(/^\/repos\/stynx-nyx\/stynx\/?/u, '');
      if (path === '') {
        name = phase('repository');
        value = repository();
      } else if (path === 'actions/workflows/266480675') {
        name = phase('workflow');
        value = { id: 266480675, path: '.github/workflows/hardening.yml', state: 'active' };
      } else if (path === 'actions/runs/900') {
        name = phase('current');
        value = run(true);
      } else if (path === 'actions/runs/500') {
        name = phase('selected');
        value = run();
      } else if (path === 'actions/runs/500/attempts/1') {
        name = phase('attempt');
        value = run();
      } else if (path === 'actions/artifacts/301') {
        name = phase('artifact');
        value = artifact;
      } else if (path === 'actions/artifacts/301/zip') {
        name = 'archive-redirect';
        value = null;
      } else if (path === 'actions/jobs/701/logs') {
        name = phase('log-redirect');
        value = null;
      } else if (path === 'actions/jobs/701') {
        name = phase('job');
        value = job;
      } else if (path === 'contents/.github/workflows/hardening.yml') {
        assert.equal(parsed.searchParams.get('ref'), 'a'.repeat(40));
        name = phase('source');
        value = {
          type: 'file',
          path: '.github/workflows/hardening.yml',
          encoding: 'base64',
          size: workflowBytes.length,
          content: workflowBytes.toString('base64'),
          sha: createHash('sha1')
            .update(`blob ${workflowBytes.length}\0`)
            .update(workflowBytes)
            .digest('hex'),
        };
      } else {
        const page = Number(parsed.searchParams.get('page'));
        assert.equal(parsed.searchParams.get('per_page'), '100');
        if (path === 'actions/workflows/266480675/runs') {
          name = `runs-${page}`;
          value = {
            total_count: runs.length,
            workflow_runs: runs.slice((page - 1) * 100, page * 100),
          };
        } else if (path === 'actions/runs/500/attempts/1/jobs') {
          const generation = Math.ceil(count('jobs-page') / Math.ceil(jobs.length / 100));
          name = `jobs-${generation === 1 ? 'before' : 'after'}-${page}`;
          value = { total_count: jobs.length, jobs: jobs.slice((page - 1) * 100, page * 100) };
        } else if (path === 'actions/runs/500/artifacts') {
          const generation = Math.ceil(count('artifacts-page') / Math.ceil(artifacts.length / 100));
          name = `artifacts-${generation === 1 ? 'before' : 'after'}-${page}`;
          value = {
            total_count: artifacts.length,
            artifacts: artifacts.slice((page - 1) * 100, page * 100),
          };
        } else throw new Error(`Unexpected external fixture request ${url}`);
      }
    }
    calls.push({ name, url, options });
    const changed = hooks[name]
      ? await hooks[name](Buffer.isBuffer(value) ? Buffer.from(value) : clone(value), {
          artifact,
          job,
          jobs,
          artifacts,
          runs,
          calls,
          logLines,
          workflowBytes,
        })
      : undefined;
    if (changed instanceof Response) return changed;
    if (name.startsWith('log-redirect'))
      return new Response(null, { status: 302, headers: { location: signed } });
    if (name === 'archive-redirect')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://fixture.blob.core.windows.net/archive.zip' },
      });
    const bytes = Buffer.isBuffer(changed ?? value)
      ? Buffer.from(changed ?? value)
      : Buffer.from(JSON.stringify(changed ?? value));
    raw.set(name, bytes);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-length': String(bytes.length),
        'content-type': Buffer.isBuffer(changed ?? value)
          ? 'application/octet-stream'
          : 'application/json',
      },
    });
  }
  const externalFetch = (url, options) =>
    url === 'https://fixture.blob.core.windows.net/archive.zip'
      ? Promise.resolve(
          new Response(new Uint8Array(body), {
            status: 200,
            headers: { 'content-length': String(body.length) },
          }),
        )
      : fetchImpl(url, options);
  return {
    fetchImpl: externalFetch,
    calls,
    raw,
    job,
    artifact,
    workflowBytes,
    log,
    collectionInput: {
      runId: 900,
      runAttempt: 1,
      headSha: 'c'.repeat(40),
      scenario: 'all',
      token,
      fetchImpl: externalFetch,
    },
  };
}
export async function acquiredAssociationFixture(options) {
  const original = associationTransport();
  const acquisition = await collectLegacyK6Baseline(original.collectionInput);
  const transport = associationTransport(options);
  return {
    acquisition,
    ...transport,
    input: { acquisition, token, fetchImpl: transport.fetchImpl },
  };
}
