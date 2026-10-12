import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createOwnedReferenceFixture } from '../../../scripts/lib/http-reference-fixture.mjs';

const fault = process.argv[2];
assert.ok(['realpath', 'entropy', 'lstat', 'remove'].includes(fault));
const originals = {
  mkdtemp: fs.mkdtempSync,
  lstat: fs.lstatSync,
  realpath: fs.realpathSync,
  remove: fs.rmSync,
  entropy: crypto.randomUUID,
  spawn: childProcess.spawn,
  createServer: net.createServer,
};
const sourcePath = fileURLToPath(
  new URL('../../../scripts/lib/http-reference-fixture.mjs', import.meta.url),
);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceSha256 = hash(fs.readFileSync(sourcePath));
const additionalOwnedDirectories = [];
let root,
  canonicalRoot,
  ownership,
  triggered = false,
  removeTriggered = false,
  spawnCalls = 0,
  portCalls = 0,
  observed;
const failure = Object.assign(new Error(`Inspector owned early-root fault: ${fault}`), {
  code: 'INSPECTOR_EARLY_ROOT_FAULT',
});
fs.mkdtempSync = (...args) => {
  const allocated = originals.mkdtemp(...args);
  if (root === undefined) {
    root = allocated;
    ownership = originals.lstat(root);
    canonicalRoot = originals.realpath(root);
  } else {
    additionalOwnedDirectories.push({ path: allocated, stat: originals.lstat(allocated) });
  }
  return allocated;
};
fs.lstatSync = (...args) => {
  if (args[0] === root && fault === 'lstat' && !triggered) {
    triggered = true;
    throw failure;
  }
  return originals.lstat(...args);
};
fs.realpathSync = (...args) => {
  if (args[0] === root && fault === 'realpath' && !triggered) {
    triggered = true;
    throw failure;
  }
  return originals.realpath(...args);
};
crypto.randomUUID = (...args) => {
  if (root && ['entropy', 'remove'].includes(fault)) {
    triggered = true;
    throw failure;
  }
  return originals.entropy(...args);
};
fs.rmSync = (...args) => {
  if ([root, canonicalRoot].includes(args[0]) && fault === 'remove') {
    removeTriggered = true;
    throw Object.assign(new Error('Inspector remove fault'), { code: 'INSPECTOR_REMOVE_FAULT' });
  }
  return originals.remove(...args);
};
childProcess.spawn = () => {
  spawnCalls++;
  throw new Error('Unexpected subprocess before early-root fault');
};
net.createServer = () => {
  portCalls++;
  throw new Error('Unexpected port allocation before early-root fault');
};
syncBuiltinESMExports();
let result;
try {
  await assert.rejects(
    createOwnedReferenceFixture({
      candidateCommit: 'a'.repeat(40),
      tree: 'b'.repeat(40),
      nonce: 'a'.repeat(36),
    }),
    (error) => {
      observed = {
        code: error.code,
        cleanup: error.cleanup ?? null,
        failureEvidence: error.failureEvidence ?? null,
      };
      return true;
    },
  );
  assert.equal(
    triggered,
    true,
    'Real pinned tool/SQL checks must complete before the injected root fault',
  );
  assert.equal(spawnCalls, 0);
  assert.equal(portCalls, 0);
  assert.equal(removeTriggered, fault === 'remove');
  const retained = fs.existsSync(root);
  if (['realpath', 'entropy'].includes(fault)) {
    assert.equal(observed.code, failure.code);
    assert.equal(retained, false, 'Known owned root must be removed after initialization refusal');
  } else {
    assert.equal(
      observed.code,
      fault === 'lstat' ? 'HTTP_REFERENCE_FIXTURE_INITIAL_ROOT_CLEANUP' : failure.code,
    );
    assert.equal(observed.cleanup.complete, false);
    assert.equal(observed.cleanup.readinessPromoting, false);
    assert.equal(
      observed.cleanup.retainedDirectorySha256,
      hash(fault === 'lstat' ? root : canonicalRoot),
    );
    assert.equal(retained, true, 'Unknown ownership or failed removal must be explicitly retained');
    if (fault === 'remove') {
      assert.equal(observed.failureEvidence.captured, true);
      assert.equal(observed.failureEvidence.cleanupRecordComplete, true);
      assert.equal(observed.failureEvidence.resourceDirectoryOutcome, 'RETAINED');
      assert.equal(observed.failureEvidence.retainedResourceDirectory, canonicalRoot);
      assert.equal(observed.failureEvidence.readinessPromoting, false);
      const cleanupBytes = fs.readFileSync(`${observed.failureEvidence.directory}/cleanup.json`);
      const cleanup = JSON.parse(cleanupBytes);
      assert.equal(cleanup.cleanup.complete, false);
      assert.deepEqual(cleanup.cleanup.failures, ['DIRECTORY_CLEANUP']);
      assert.equal(cleanup.readinessPromoting, false);
    }
  }
  result = {
    sourceSha256,
    fault,
    triggered,
    spawnCalls,
    portCalls,
    observed,
    retainedBeforeInspectorCleanup: retained,
    runtimeCustodyComplete: false,
    performanceQualified: false,
    readinessPromoting: false,
  };
} finally {
  fs.mkdtempSync = originals.mkdtemp;
  fs.lstatSync = originals.lstat;
  fs.realpathSync = originals.realpath;
  fs.rmSync = originals.remove;
  crypto.randomUUID = originals.entropy;
  childProcess.spawn = originals.spawn;
  net.createServer = originals.createServer;
  syncBuiltinESMExports();
  if (root && fs.existsSync(root)) {
    const actual = fs.lstatSync(root);
    assert.equal(actual.dev, ownership.dev);
    assert.equal(actual.ino, ownership.ino);
    assert.equal(actual.isSymbolicLink(), false);
    fs.rmSync(root, { recursive: true, force: false });
  }
  assert.equal(root === undefined || !fs.existsSync(root), true);
  for (const { path, stat } of additionalOwnedDirectories) {
    const current = fs.lstatSync(path);
    assert.equal(current.dev, stat.dev);
    assert.equal(current.ino, stat.ino);
    assert.equal(current.isSymbolicLink(), false);
    fs.rmSync(path, { recursive: true, force: false });
    assert.equal(fs.existsSync(path), false);
  }
  for (const [actual, expected] of [
    [fs.mkdtempSync, originals.mkdtemp],
    [fs.lstatSync, originals.lstat],
    [fs.realpathSync, originals.realpath],
    [fs.rmSync, originals.remove],
    [crypto.randomUUID, originals.entropy],
    [childProcess.spawn, originals.spawn],
    [net.createServer, originals.createServer],
  ])
    assert.equal(actual, expected);
}
process.stdout.write(
  `${JSON.stringify({ ...result, inspectorCleanupComplete: true, builtinRestorationComplete: true })}\n`,
);
