import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Parser-only historical snapshot: Git blob e741af47000046c97f3ce464175a71b825923d67.
// Current candidate manifests have an additional approved zod dependency. The
// real producer still refuses those bytes against its historical anchor pin.
// This fixture supplies no live-build, worker, current-candidate or RC custody.
export function historicalDiagnosticReferenceManifest() {
  const bytes = readFileSync(
    new URL('./http-runtime-reference-manifest-pre-zod.json.fixture', import.meta.url),
  );
  assert.equal(bytes.length, 2132);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'efe928a7a98a61824ceeb7e68ffdb6134c41eadc14534b02a2b0c989667dfa38',
  );
  assert.equal(
    createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
    'e741af47000046c97f3ce464175a71b825923d67',
  );
  return bytes;
}
