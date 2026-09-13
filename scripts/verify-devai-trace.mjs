#!/usr/bin/env node
// Verifies the executable-test bindings in law/trace.json.
//
// DEVAI 1.4.5 validates the trace's shape and path classification but does
// not verify `assertion_count` / `assertion_digest_sha256`, so those fields
// were unenforced after ADR-DEVAI-ADOPTION-0002 retired the previous version
// of this script together with the 1.1.1 campaign census it carried. This
// restores only the durable binding check:
//
//   - every test_corpus path is tracked and is an executable test file;
//   - its assertion projection (count + digest) matches the trace;
//   - every tracked executable test is bound in the trace.
//
// The projection is the canonical ordered list of assertion call sites
// (`<line>:<trimmed text>`), hashed with SHA-256; it is the same algorithm
// the retired verifier used, so existing bindings remain valid.
//
// Rebinding is an Architect act. `--print` lists the current projection of
// every stale or unbound test without writing anything.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const tracePath = resolve(repoRoot, 'law/trace.json');
const print = process.argv.includes('--print');
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

function isExecutableTest(path) {
  return /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path);
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

const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
const trackedSet = new Set(trackedPaths());
const executableTests = [...trackedSet].filter(isExecutableTest).sort();
const boundPaths = new Set();
const stale = [];

for (const entry of trace.test_corpus) {
  if (boundPaths.has(entry.path)) fail(`duplicate test_corpus path: ${entry.path}`);
  boundPaths.add(entry.path);
  if (!trackedSet.has(entry.path) || !existsSync(resolve(repoRoot, entry.path))) {
    fail(`untracked or missing test path: ${entry.path}`);
    continue;
  }
  if (!isExecutableTest(entry.path)) {
    fail(`non-executable path in test_corpus: ${entry.path}`);
    continue;
  }
  const projection = assertionProjection(entry.path);
  const digest = sha256(projection);
  if (projection.length !== entry.assertion_count || digest !== entry.assertion_digest_sha256) {
    fail(
      `assertion binding drifted for ${entry.path}: bound ${entry.assertion_count}/${entry.assertion_digest_sha256.slice(0, 12)}, current ${projection.length}/${digest.slice(0, 12)}`,
    );
    stale.push({ path: entry.path, count: projection.length, digest });
  }
}

for (const path of executableTests) {
  if (!boundPaths.has(path)) {
    fail(`executable test missing from trace: ${path}`);
    const projection = assertionProjection(path);
    stale.push({ path, count: projection.length, digest: sha256(projection) });
  }
}

if (print && stale.length > 0) {
  console.log(JSON.stringify(stale, null, 2));
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[trace][fail] ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[trace][ok] ${trace.test_corpus.length} executable tests bound; ${executableTests.length} tracked`,
);
