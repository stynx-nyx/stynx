import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverPublishablePackages } from './publishable-packages.mjs';

function workspaceFixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-publishable-packages-'));
  mkdirSync(join(workspace, 'packages'), { recursive: true });
  mkdirSync(join(workspace, 'packages-web'), { recursive: true });
  return workspace;
}

function writeManifest(workspace, root, directory, manifest) {
  const packageDirectory = join(workspace, root, directory);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, 'package.json'), `${JSON.stringify(manifest)}\n`);
}

test('discovers the complete public roster deterministically and skips private packages', () => {
  const workspace = workspaceFixture();
  try {
    writeManifest(workspace, 'packages', 'zeta', { name: '@stynx-nyx/zeta' });
    writeManifest(workspace, 'packages-web', 'alpha', { name: '@stynx-nyx/alpha' });
    writeManifest(workspace, 'packages', 'internal', {
      name: '@stynx-nyx/internal',
      private: true,
    });

    assert.deepEqual(
      discoverPublishablePackages(workspace).map(({ name, dir }) => ({ name, dir })),
      [
        { name: '@stynx-nyx/alpha', dir: 'packages-web/alpha' },
        { name: '@stynx-nyx/zeta', dir: 'packages/zeta' },
      ],
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('fails closed when either package root is missing', () => {
  const workspace = workspaceFixture();
  try {
    rmSync(join(workspace, 'packages-web'), { recursive: true, force: true });
    assert.throws(
      () => discoverPublishablePackages(workspace),
      /publishable package root is missing: packages-web/u,
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('rejects malformed, out-of-scope, and duplicate public manifests', async (t) => {
  await t.test('malformed JSON', () => {
    const workspace = workspaceFixture();
    try {
      const directory = join(workspace, 'packages', 'bad-json');
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'package.json'), '{');
      assert.throws(() => discoverPublishablePackages(workspace), /is not valid JSON/u);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  await t.test('out-of-scope name', () => {
    const workspace = workspaceFixture();
    try {
      writeManifest(workspace, 'packages', 'foreign', { name: '@other/foreign' });
      assert.throws(
        () => discoverPublishablePackages(workspace),
        /is publishable but has no @stynx-nyx\/ name/u,
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  await t.test('duplicate name', () => {
    const workspace = workspaceFixture();
    try {
      writeManifest(workspace, 'packages', 'alpha', { name: '@stynx-nyx/duplicate' });
      writeManifest(workspace, 'packages-web', 'alpha', { name: '@stynx-nyx/duplicate' });
      assert.throws(
        () => discoverPublishablePackages(workspace),
        /duplicate publishable package name: @stynx-nyx\/duplicate/u,
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
