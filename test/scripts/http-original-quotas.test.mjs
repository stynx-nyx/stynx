import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { loadHttpOriginalQuotaRecipe } from '../../scripts/lib/http-original-quotas.mjs';
import { createOwnedOriginalReferenceFixture } from '../../scripts/lib/http-reference-fixture.mjs';

// INV-PERF-001: actual declaration bytes never grant a resource or workload admission.
const bytes = readFileSync(new URL('../../reference/api/docker-compose.yml', import.meta.url));
const expected = {
  STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_READ_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_DELETE_LIMIT: '12000',
  STYNX_SAMPLE_RECORD_DELETE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT: '6000',
  STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS: '60',
  STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT: '6000',
  STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS: '60',
};
const invalid = { code: 'HTTP_ORIGINAL_QUOTAS_INVALID' };
function fixture(t, body = bytes) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx quota espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, 'reference/api/docker-compose.yml');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, { mode: 0o644 });
  return { root, path };
}
test('actual Compose recipe retains exactly the ten existing string quota values and hash without admission', (t) => {
  const f = fixture(t);
  const before = lstatSync(f.path, { bigint: true });
  const result = loadHttpOriginalQuotaRecipe(f.root);
  assert.deepEqual(result.environment, expected);
  assert.equal(result.source.path, 'reference/api/docker-compose.yml');
  assert.equal(result.source.sha256, createHash('sha256').update(bytes).digest('hex'));
  for (const k of ['runtimeAdmission', 'performanceQualified', 'readinessPromoting'])
    assert.equal(result[k], false);
  result.environment.STYNX_SAMPLE_RECORD_DELETE_LIMIT = '1';
  assert.deepEqual(loadHttpOriginalQuotaRecipe(f.root).environment, expected);
  assert.deepEqual(readFileSync(f.path), bytes);
  assert.equal(lstatSync(f.path, { bigint: true }).mtimeNs, before.mtimeNs);
});
for (const [label, body] of [
  [
    'changed quota',
    bytes
      .toString()
      .replace("STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'", "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '1'"),
  ],
  [
    'numeric quota',
    bytes
      .toString()
      .replace(
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'",
        'STYNX_SAMPLE_RECORD_CREATE_LIMIT: 6000',
      ),
  ],
  [
    'missing quota',
    bytes.toString().replace(/      STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'\n/u, ''),
  ],
  [
    'extra quota',
    bytes
      .toString()
      .replace(
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'",
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'\n      STYNX_SAMPLE_FAKE_LIMIT: '6000'",
      ),
  ],
  [
    'duplicate quota',
    bytes
      .toString()
      .replace(
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'",
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'\n      STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'",
      ),
  ],
  [
    'alias quota',
    bytes
      .toString()
      .replace(
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: '6000'",
        "STYNX_SAMPLE_RECORD_CREATE_LIMIT: &quota '6000'",
      )
      .replace("STYNX_SAMPLE_RECORD_READ_LIMIT: '6000'", 'STYNX_SAMPLE_RECORD_READ_LIMIT: *quota'),
  ],
  ['wrong service', bytes.toString().replace('  reference-api:', '  another-api:')],
  [
    'list environment',
    'services:\n  reference-api:\n    environment:\n      - STYNX_SAMPLE_RECORD_CREATE_LIMIT=6000\n',
  ],
  ['malformed YAML', 'services: [\n'],
])
  test(`actual quota declaration refuses ${label} without replacing its evidence`, (t) => {
    const f = fixture(t, body);
    assert.throws(() => loadHttpOriginalQuotaRecipe(f.root), invalid);
    assert.equal(readFileSync(f.path, 'utf8'), body);
  });
for (const mode of [0o600, 0o664])
  test(`quota mode${mode.toString(8)} retains the generic declaration profile`, (t) => {
    const f = fixture(t);
    chmodSync(f.path, mode);
    assert.throws(() => loadHttpOriginalQuotaRecipe(f.root));
  });
for (const fault of ['hardlink', 'symlink', 'ancestor'])
  test(`quota actual ${fault} is not admitted even with identical bytes`, (t) => {
    const f = fixture(t);
    if (fault === 'hardlink') linkSync(f.path, join(f.root, 'copy'));
    else if (fault === 'symlink') {
      const copy = join(f.root, 'copy');
      writeFileSync(copy, bytes);
      rmSync(f.path);
      symlinkSync(copy, f.path);
    } else {
      const copy = join(f.root, 'copy');
      mkdirSync(copy);
      writeFileSync(join(copy, 'docker-compose.yml'), bytes);
      rmSync(dirname(f.path), { recursive: true });
      symlinkSync(copy, dirname(f.path));
    }
    assert.throws(() => loadHttpOriginalQuotaRecipe(f.root));
  });
test('quota root and argument closedness prohibit caller paths or overrides', (t) => {
  const f = fixture(t);
  assert.throws(() => loadHttpOriginalQuotaRecipe('.'));
  assert.throws(() => loadHttpOriginalQuotaRecipe(f.root, expected), invalid);
  assert.throws(() => loadHttpOriginalQuotaRecipe({ root: f.root }), invalid);
});
test('original fixture accepts no identity/selector forgery and allocates no resources for refused requests', async () => {
  let reads = 0;
  const selector = { scenarioId: 'auth', profileId: 'local' };
  for (const bad of [
    undefined,
    {},
    { ...selector, rate: 1 },
    new Proxy(selector, {}),
    {
      scenarioId: 'auth',
      get profileId() {
        reads++;
        return 'local';
      },
    },
  ])
    await assert.rejects(createOwnedOriginalReferenceFixture({}, bad), {
      code: 'HTTP_ORIGINAL_SCENARIO_INVALID',
    });
  for (const scenarioId of ['auth', 'crud', 'upload', 'cascade-delete'])
    for (const profileId of ['local', 'hardening'])
      await assert.rejects(createOwnedOriginalReferenceFixture({}, { scenarioId, profileId }), {
        code: 'HTTP_REFERENCE_FIXTURE_REQUEST',
      });
  await assert.rejects(createOwnedOriginalReferenceFixture({}, selector, {}), {
    code: 'HTTP_REFERENCE_FIXTURE_REQUEST',
  });
  assert.equal(reads, 0);
});

test('read-only exact Compose declaration remains accepted without changing its mode', (t) => {
  const f = fixture(t);
  chmodSync(f.path, 0o444);
  assert.deepEqual(loadHttpOriginalQuotaRecipe(f.root).environment, expected);
  assert.equal(lstatSync(f.path).mode & 0o777, 0o444);
});
