import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '..', '..');

const requiredImports = new Map([
  [
    'packages-web/angular-auth/test/angular-auth.spec.ts',
    ['@stynx-nyx/angular-auth/testing', '@stynx-nyx/angular-i18n/testing'],
  ],
  [
    'packages-web/angular-flow/test/routes-and-exports.spec.ts',
    ['@stynx-nyx/angular-auth/testing'],
  ],
  ['packages-web/angular-flow/test/flow-fan-out.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  [
    'packages-web/angular-iam/test/routing/angular-iam-routes.spec.ts',
    ['@stynx-nyx/angular-auth/testing'],
  ],
  ['packages-web/angular-iam/test/iam-api-and-routes.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  [
    'packages-web/angular-sessions/test/angular-sessions.spec.ts',
    ['@stynx-nyx/angular-auth/testing', '@stynx-nyx/angular-i18n/testing'],
  ],
  ['packages-web/angular-trash/test/angular-trash.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  [
    'packages-web/angular-profile/test/angular-profile.spec.ts',
    ['@stynx-nyx/angular-i18n/testing'],
  ],
  [
    'packages-web/angular-trash/test/trash-confirm-flow.spec.ts',
    ['@stynx-nyx/angular-i18n/testing'],
  ],
  ['packages/data/test/unit/transaction.spec.ts', ['@stynx-nyx/testing']],
]);

function importedSpecifiers(source) {
  return [...source.matchAll(/\bimport\s+(?:[\s\S]*?\bfrom\s*)?(['"])([^'"]+)\1\s*;?/gu)].map(
    (match) => match[2],
  );
}

function isPrivateHelperSpecifier(specifier) {
  if (
    /^@stynx-nyx\/(?:testing|angular-auth|angular-i18n)\/(?:src|testing\/src)(?:\/|$)/u.test(
      specifier,
    )
  ) {
    return true;
  }
  return (
    specifier.startsWith('.') &&
    (/(?:^|\/)(?:testing|angular-auth|angular-i18n)\/(?:src|testing)(?:\/|$)/u.test(specifier) ||
      /(?:^|\/)testing\/index(?:\.[^/]*)?$/u.test(specifier))
  );
}

test('CTG-0006 private helper specifier detector rejects internal paths and permits public imports', () => {
  const rejected = [
    '@stynx-nyx/testing/src/fake-transaction',
    '@stynx-nyx/angular-auth/src/index',
    '@stynx-nyx/angular-i18n/src/index',
    '@stynx-nyx/angular-auth/testing/src/index',
    '../../packages/testing/src/fake-transaction',
    '../angular-auth/testing/index',
    '../../angular-i18n/src/index',
    '../testing/index',
    '../testing/index.ts',
  ];
  const allowed = [
    '@stynx-nyx/testing',
    '@stynx-nyx/angular-auth/testing',
    '@stynx-nyx/angular-i18n/testing',
    '@stynx-nyx/data',
    'vitest',
  ];

  for (const specifier of rejected) {
    assert.equal(isPrivateHelperSpecifier(specifier), true, `${specifier} must be rejected`);
  }
  for (const specifier of allowed) {
    assert.equal(isPrivateHelperSpecifier(specifier), false, `${specifier} must be allowed`);
  }
});

test('CTG-0006 migrated helper tests use only their published package subpaths', () => {
  assert.equal(
    requiredImports.size,
    10,
    'the adoption sensor must scan all ten migrated test files',
  );
  for (const [file, expectedSpecifiers] of requiredImports) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const specifiers = importedSpecifiers(source);

    for (const specifier of expectedSpecifiers) {
      assert.equal(specifiers.includes(specifier), true, `${file} must import ${specifier}`);
    }
    for (const specifier of specifiers) {
      assert.equal(
        isPrivateHelperSpecifier(specifier),
        false,
        `${file} must not import helper source paths (${specifier})`,
      );
    }
  }
});
