import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Only diagnostic parser/standalone-refusal fixtures consume these snapshots.
// Never use them for a live build, actual candidate manifest or runtime custody.
// The historical snapshot is reviewed Git blob db4b602b7b72ecc2c1ac4ba549b2f28793c74da5.
// The refusal snapshot is the actual acc38ef5 version-candidate Git blob
// 79aa37b2d5283ef7538bdd5af84dc982e9809113, retained without a Git dependency.
function read(name, version, sha256, blob) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  assert.equal(bytes.length, 1827);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
  assert.equal(
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    blob,
  );
  assert.equal(JSON.parse(bytes).version, version);
  return bytes;
}

export function historicalDiagnosticFlowManifest() {
  return read(
    './http-runtime-flow-manifest-1.5.7.json.fixture',
    '1.5.7',
    '7a9bc69161ab7e2a2c2f1a61e6dd94ee558f1c76b25c3aa48fd564f0e633bbb1',
    'db4b602b7b72ecc2c1ac4ba549b2f28793c74da5',
  );
}

export function versionedDiagnosticFlowManifestRefusal() {
  return read(
    './http-runtime-flow-manifest-1.6.0-refusal.json.fixture',
    '1.6.0',
    '3946614be3f519c7da9e6a1c8e374efa25e589efab3baa6f7ba50bbef97c52e0',
    '79aa37b2d5283ef7538bdd5af84dc982e9809113',
  );
}
