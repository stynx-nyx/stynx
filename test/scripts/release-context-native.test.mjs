import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyReleaseContext,
  isVersionedPreModeCandidate,
  ReleaseContextError,
} from '../../scripts/lib/release-context.mjs';

// These opaque fields originate in fresh JSON. Git rows and package names are
// constructed by the release runner; no release entrypoint runs in these tests.
const fresh = (value) => JSON.parse(JSON.stringify(value));
function input() {
  const packageStates = Array.from({ length: 44 }, (_, index) => ({
    name: `@stynx-nyx/native-${index}`,
    manifestPath: `packages/native-${index}/package.json`,
    baseVersion: '1.4.0',
    candidateVersion: '1.5.0-rc.1',
  }));
  return fresh({
    baseRootVersion: '1.4.0',
    candidateRootVersion: '1.5.0-rc.1',
    versionCommitVersion: '1.5.0',
    packageStates,
    changedManifestPaths: packageStates.map(({ manifestPath }) => manifestPath),
    changesetIdsOnDisk: ['native'],
    followUpChanges: [],
    basePreState: null,
    preState: {
      mode: 'pre',
      tag: 'rc',
      initialVersions: Object.fromEntries(packageStates.map(({ name }) => [name, '1.4.0'])),
      changesets: ['native'],
    },
  });
}

test('native release context accepts the complete stable-base fixture', () => {
  assert.equal(isVersionedPreModeCandidate(input()), true);
});

test('native release context preserves array base-version regexp coercion', () => {
  const value = input();
  value.baseRootVersion = fresh(['1.4.0']);
  assert.equal(isVersionedPreModeCandidate(value), true);
});

test('native release context retains the candidate array slice result', () => {
  const value = input();
  value.candidateRootVersion = fresh(['1.5.0-rc.1']);
  assert.equal(isVersionedPreModeCandidate(value), false);
});

test('native release context throws version coercion before inspecting the pre-state', () => {
  const value = input();
  value.baseRootVersion = fresh({ toString: 'not-callable' });
  value.preState = null;
  assert.throws(
    () => isVersionedPreModeCandidate(value),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.name, 'TypeError');
      assert.equal(error.message, 'Cannot convert object to primitive value');
      assert.equal(error.code, undefined);
      return true;
    },
  );
});

test('native release context preserves boxed and nullish pre-state refusal', () => {
  const results = [null, false, 7, 'pre', [], {}].map((preState) => {
    const value = input();
    value.preState = fresh(preState);
    return isVersionedPreModeCandidate(value);
  });
  assert.deepEqual(results, [false, false, false, false, false, false]);
});

test('native release context still requires changesets to be an array', () => {
  const value = input();
  value.preState.changesets = 'native';
  assert.equal(isVersionedPreModeCandidate(value), false);
});

test('native release context retains prior-RC optional null initial-version reads', () => {
  const value = input();
  value.baseRootVersion = '1.5.0-rc.1';
  value.candidateRootVersion = '1.5.0-rc.2';
  value.packageStates = value.packageStates.map((state) => ({
    ...state,
    baseVersion: '1.5.0-rc.1',
    candidateVersion: '1.5.0-rc.2',
  }));
  value.basePreState = fresh({
    mode: 'pre',
    tag: 'rc',
    changesets: ['native'],
    initialVersions: null,
  });
  value.preState.initialVersions = null;
  assert.equal(isVersionedPreModeCandidate(value), true);
});

test('native release context rejects ambiguous markers before invalid storage', () => {
  assert.throws(
    () =>
      classifyReleaseContext({
        baseCommit: 'a'.repeat(40),
        headCommit: 'b'.repeat(40),
        commits: [
          { sha: 'b'.repeat(40), subject: 'ci: version packages' },
          { sha: 'c'.repeat(40), subject: 'ci: version packages' },
        ],
        versionParent: null,
        versionChanges: [],
        followUpChanges: [],
        storageVersionArtifacts: null,
      }),
    (error) => {
      assert.ok(error instanceof ReleaseContextError);
      assert.equal(error.name, 'ReleaseContextError');
      assert.equal(error.code, 'RELEASE_CONTEXT_AMBIGUOUS');
      assert.equal(error.message, 'candidate contains multiple version-package commits');
      return true;
    },
  );
});
