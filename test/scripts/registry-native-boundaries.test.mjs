import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  validateRegistryCensus,
  fetchRegistryCensus,
  fetchGithubPackagesInventory,
} from '../../scripts/lib/registry-version-policy.mjs';

const repository = resolve(import.meta.dirname, '../..');
const names = [
  ...JSON.parse(readFileSync(resolve(repository, '.changeset/config.json'))).fixed[0],
].sort();
const roster = JSON.parse(
  readFileSync(resolve(repository, 'law/policy/stynx-package-roster.json')),
);
const anomalyPolicy = JSON.parse(
  readFileSync(resolve(repository, 'law/policy/registry-version-anomalies.json')),
);
const campaignPolicy = {
  candidate: { version: '3.0.0' },
  approved_first_publications: roster.approved_first_publications,
  publishable_packages: roster.publishable_packages,
};
function input() {
  return {
    packageNames: names,
    registryStatesByPackage: new Map(
      names.map((name) => [name, { authenticated: true, status: 200, metadata: {} }]),
    ),
    candidate: '3.0.0',
    anomalyPolicy,
    campaignPolicy,
  };
}

// These are native JSON representations at the existing policy helper boundary.
// The owning census tests cover accepted arrays and complete registry metadata.
for (const [label, value] of [
  ['number', 1],
  ['object', {}],
  ['string', 'x'],
  ['null', null],
  ['undefined', undefined],
]) {
  test(`campaign publishable ${label} preserves native iteration or policy refusal`, () => {
    const nativeFailure = label === 'number' || label === 'object';
    assert.throws(
      () =>
        validateRegistryCensus({
          ...input(),
          campaignPolicy: { ...campaignPolicy, publishable_packages: value },
        }),
      (error) => {
        assert.equal(error.name, nativeFailure ? 'TypeError' : 'RegistryVersionPolicyError');
        assert.equal(
          error.code,
          nativeFailure ? undefined : 'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
        );
        assert.equal(
          error.message,
          nativeFailure
            ? '(policy.publishable_packages ?? []) is not iterable'
            : 'the first-publication policy does not match the exact 47/44/3 roster',
        );
        return true;
      },
    );
  });
  test(`anomaly ${label} preserves native destructuring or policy refusal`, () => {
    const nativeFailure = label === 'number' || label === 'object';
    assert.throws(
      () =>
        validateRegistryCensus({
          ...input(),
          anomalyPolicy: { ...anomalyPolicy, anomalies: value },
        }),
      (error) => {
        assert.equal(error.name, nativeFailure ? 'TypeError' : 'RegistryVersionPolicyError');
        assert.equal(error.code, nativeFailure ? undefined : 'REGISTRY_ANOMALY_POLICY_UNSUPPORTED');
        assert.equal(
          error.message,
          nativeFailure
            ? `${label === 'number' ? 'number 1' : 'object'} is not iterable (cannot read property Symbol(Symbol.iterator))`
            : 'the anomaly policy is not the exact approved exception',
        );
        return true;
      },
    );
  });
}

test('approved publication admission precedes malformed publishable iteration', () => {
  assert.throws(
    () =>
      validateRegistryCensus({
        ...input(),
        campaignPolicy: {
          ...campaignPolicy,
          approved_first_publications: [],
          publishable_packages: 1,
        },
      }),
    {
      name: 'RegistryVersionPolicyError',
      code: 'REGISTRY_FIRST_PUBLICATION_POLICY_UNSUPPORTED',
      message: 'the first-publication policy does not match the exact 47/44/3 roster',
    },
  );
});

// All fetches below are injected local functions; no credentials or network are used.
for (const [name, fetchCensus] of [
  ['registry', fetchRegistryCensus],
  ['inventory', fetchGithubPackagesInventory],
]) {
  const options = { packageNames: ['@stynx-nyx/core'], token: 'synthetic-only' };
  test(`${name} partial response reads json once with its original receiver`, async () => {
    const metadata = { identity: 'native metadata' };
    const entries = [];
    let reads = 0,
      calls = 0,
      receiver;
    const response = {
      status: 200,
      ok: true,
      get json() {
        reads++;
        return function () {
          calls++;
          receiver = this;
          return name === 'registry' ? metadata : entries;
        };
      },
    };
    const value = await fetchCensus({ ...options, fetchImpl: async () => response });
    assert.equal(receiver, response);
    assert.equal(reads, 1);
    assert.equal(calls, 1);
    if (name === 'registry') assert.equal(value.get('@stynx-nyx/core').metadata, metadata);
    else assert.deepEqual(value, { authenticated: true, complete: true, packageNames: [] });
  });
  test(`${name} json getter failure remains inside the existing policy catch`, async () => {
    const sentinel = new Error('injected json getter sentinel');
    let reads = 0;
    const response = {
      status: 200,
      ok: true,
      get json() {
        reads++;
        throw sentinel;
      },
    };
    await assert.rejects(fetchCensus({ ...options, fetchImpl: async () => response }), (error) => {
      assert.notEqual(error, sentinel);
      assert.equal(error.name, 'RegistryVersionPolicyError');
      assert.equal(
        error.code,
        name === 'registry' ? 'REGISTRY_METADATA_MALFORMED' : 'REGISTRY_INVENTORY_INCOMPLETE',
      );
      assert.equal(
        error.message,
        name === 'registry'
          ? '@stynx-nyx/core: registry response is not JSON'
          : 'GitHub package inventory response is malformed',
      );
      return true;
    });
    assert.equal(reads, 1);
  });
  test(`${name} earlier response getter failure escapes unchanged before json access`, async () => {
    const sentinel = new Error('injected response getter sentinel');
    let jsonReads = 0;
    const response = {
      get status() {
        if (name === 'registry') throw sentinel;
        return 200;
      },
      get ok() {
        throw sentinel;
      },
      get json() {
        jsonReads++;
        return () => [];
      },
    };
    await assert.rejects(
      fetchCensus({ ...options, fetchImpl: async () => response }),
      (error) => error === sentinel,
    );
    assert.equal(jsonReads, 0);
  });
}
