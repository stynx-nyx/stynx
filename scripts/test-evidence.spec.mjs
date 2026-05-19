import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { aggregateEvidence } from './test-evidence.mjs';

function writeArtifact(workspace, packageDir, level, overrides = {}) {
  const dir = join(workspace, packageDir, '.test-results');
  mkdirSync(dir, { recursive: true });
  const artifact = {
    schemaVersion: '1',
    package: overrides.package ?? `@fixture/${packageDir.split('/').at(-1)}`,
    level,
    runner: level === 'mutation' ? 'stryker-vitest' : 'vitest',
    status: 'passed',
    startedAt: '2026-05-19T00:00:00.000Z',
    endedAt: '2026-05-19T00:00:01.000Z',
    durationMs: 1000,
    exitCode: 0,
    totals: {
      files: 1,
      tests: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      todo: 0,
    },
    metric:
      level === 'mutation'
        ? {
            kind: 'score',
            score: overrides.score ?? 75,
          }
        : {
            kind: 'none',
          },
    artifacts: {
      raw: `.test-results/${level}.log`,
    },
  };
  writeFileSync(join(dir, `${level}.json`), JSON.stringify(artifact, null, 2) + '\n');
}

test('aggregateEvidence counts every package mutation artifact in a workspace fixture', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-test-evidence-'));
  try {
    for (const packageDir of ['packages/alpha', 'packages/beta', 'packages-web/gamma']) {
      writeArtifact(workspace, packageDir, 'unit');
      writeArtifact(workspace, packageDir, 'coverage');
      writeArtifact(workspace, packageDir, 'mutation');
    }

    const evidence = aggregateEvidence({ workspace });

    assert.equal(evidence.levels.unit.packages, 3);
    assert.equal(evidence.levels.coverage.packages, 3);
    assert.equal(evidence.levels.mutation.packages, 3);
    assert.equal(evidence.levels.mutation.results.length, 3);
    assert.equal(evidence.all.length, 9);
    assert.deepEqual(evidence.levels.mutation.results.map((r) => r.package).sort(), [
      '@fixture/alpha',
      '@fixture/beta',
      '@fixture/gamma',
    ]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
