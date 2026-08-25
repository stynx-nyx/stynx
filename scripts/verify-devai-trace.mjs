import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const tracePath = resolve(repoRoot, 'law/trace.json');
const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
const failures = [];

function fail(message) {
  failures.push(message);
}

function trackedPaths() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort();
}

function isTestSurface(path) {
  return /(^|\/)(?:test|tests)\//u.test(path) || /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path);
}

function isExecutableTest(path) {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path);
}

function classifySuite(path) {
  const lower = path.toLowerCase();
  if (/(?:\/e2e\/|\.e2e\.|playwright)/u.test(lower)) return 'e2e';
  if (/(?:integration|\.int\.)/u.test(lower)) return 'int';
  if (/(?:security|secret|rls|authz|permission-negative)/u.test(lower)) return 'sec';
  if (/contract/u.test(lower)) return 'contract';
  if (/smoke/u.test(lower)) return 'smoke';
  if (/regression|mutation|perf|bench/u.test(lower)) return 'regression';
  return 'unit';
}

function assertionProjection(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
    .split(/\r?\n/u)
    .map((text, index) => ({ line: index + 1, text: text.trim() }))
    .filter(
      ({ text }) =>
        /\b(?:expect|assert(?:\.[A-Za-z_$][\w$]*)?|resourceCountIs|hasResource(?:Properties)?|hasOutput|openRecordDocumentCard)\s*\(/u.test(
          text,
        ) || /^\{\s*msg:.*expect:/u.test(text),
    )
    .map(({ line, text }) => `${line}:${text}`);
}

function sha256(lines) {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

const tracked = trackedPaths();
const trackedSet = new Set(tracked);
const testSurface = tracked.filter(isTestSurface);
const executableTests = tracked.filter(isExecutableTest);
const executableSet = new Set(executableTests);
const invariantFiles = readdirSync(resolve(repoRoot, 'law/invariants'))
  .filter((name) => /^INV-.*\.json$/u.test(name))
  .sort();
const invariants = invariantFiles.map((name) =>
  JSON.parse(readFileSync(resolve(repoRoot, 'law/invariants', name), 'utf8')),
);
const activeIds = new Set(
  invariants.filter(({ status }) => status === 'active').map(({ id }) => id),
);
const traceInvariantIds = new Set(trace.invariants.map(({ id }) => id));
const corpusByPath = new Map();

for (const entry of trace.test_corpus) {
  if (corpusByPath.has(entry.path)) fail(`duplicate test_corpus path: ${entry.path}`);
  corpusByPath.set(entry.path, entry);
  if (!trackedSet.has(entry.path)) fail(`untracked or missing test path: ${entry.path}`);
  if (!executableSet.has(entry.path)) fail(`non-executable path in test_corpus: ${entry.path}`);
  if (entry.suite !== classifySuite(entry.path)) {
    fail(
      `suite mismatch for ${entry.path}: expected ${classifySuite(entry.path)}, found ${entry.suite}`,
    );
  }
  if (!Array.isArray(entry.invariant_ids) || entry.invariant_ids.length === 0) {
    fail(`unmapped executable test: ${entry.path}`);
  }
  for (const id of entry.invariant_ids) {
    if (!activeIds.has(id)) fail(`unknown or inactive invariant ${id} on ${entry.path}`);
  }
  const projection = assertionProjection(entry.path);
  if (projection.length !== entry.assertion_count) {
    fail(
      `assertion count mismatch for ${entry.path}: expected ${projection.length}, found ${entry.assertion_count}`,
    );
  }
  const digest = sha256(projection);
  if (digest !== entry.assertion_digest_sha256) fail(`assertion digest mismatch for ${entry.path}`);
}

for (const path of executableTests) {
  if (!corpusByPath.has(path)) fail(`executable test missing from trace: ${path}`);
}
for (const id of activeIds) {
  if (!traceInvariantIds.has(id)) fail(`active invariant missing from trace: ${id}`);
  if (![...corpusByPath.values()].some((entry) => entry.invariant_ids.includes(id))) {
    fail(`active invariant has no executable test: ${id}`);
  }
}

const supplemental = trace.invariants.flatMap((entry) =>
  entry.tests.filter(
    ({ target_type: targetType }) => targetType === 'script' || targetType === 'config-attestation',
  ),
);
for (const entry of trace.invariants) {
  for (const doc of entry.docs ?? []) {
    if (!existsSync(resolve(repoRoot, doc.doc))) fail(`missing trace document: ${doc.doc}`);
  }
  for (const test of entry.tests ?? []) {
    if (!trackedSet.has(test.path)) fail(`missing or untracked trace target: ${test.path}`);
  }
}

const mustIds = invariants
  .filter(({ status, severity }) => status === 'active' && severity === 'gate')
  .map(({ id }) => id);
const mustMapped = mustIds.filter((id) =>
  [...corpusByPath.values()].some((entry) => entry.invariant_ids.includes(id)),
);
if (testSurface.length !== 481)
  fail(`tracked test-path census drifted: expected 481, found ${testSurface.length}`);
if (executableTests.length !== 366)
  fail(`executable test census drifted: expected 366, found ${executableTests.length}`);
if (testSurface.length - executableTests.length !== 115) {
  fail(
    `fixture/support census drifted: expected 115, found ${testSurface.length - executableTests.length}`,
  );
}
if (supplemental.length !== 14)
  fail(`script/config-attestation census drifted: expected 14, found ${supplemental.length}`);
if (testSurface.length + supplemental.length !== 495) {
  fail(
    `governed test surface drifted: expected 495, found ${testSurface.length + supplemental.length}`,
  );
}
if (trace.meta?.completeness?.min_invariants_with_tests_ratio !== 1)
  fail('active invariant completeness floor is not 1');
if (trace.meta?.completeness?.min_must_invariants_with_tests_ratio !== 1)
  fail('readiness-bearing completeness floor is not 1');
if (mustMapped.length !== mustIds.length)
  fail(`readiness-bearing invariant coverage is ${mustMapped.length}/${mustIds.length}`);

const summary = {
  ok: failures.length === 0,
  tracked_test_paths: testSurface.length,
  executable_tests: executableTests.length,
  fixtures_and_support: testSurface.length - executableTests.length,
  scripts_and_config_attestations: supplemental.length,
  governed_test_surface: testSurface.length + supplemental.length,
  active_invariants: activeIds.size,
  active_test_mapping_ratio: activeIds.size === 0 ? 0 : traceInvariantIds.size / activeIds.size,
  readiness_invariant_test_ratio: mustIds.length === 0 ? 0 : mustMapped.length / mustIds.length,
  failures,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
