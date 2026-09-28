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
  ['packages-web/angular-flow/test/routes-and-exports.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  ['packages-web/angular-flow/test/flow-fan-out.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  ['packages-web/angular-iam/test/routing/angular-iam-routes.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  ['packages-web/angular-iam/test/iam-api-and-routes.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  [
    'packages-web/angular-sessions/test/angular-sessions.spec.ts',
    ['@stynx-nyx/angular-auth/testing', '@stynx-nyx/angular-i18n/testing'],
  ],
  ['packages-web/angular-trash/test/angular-trash.spec.ts', ['@stynx-nyx/angular-auth/testing']],
  ['packages-web/angular-profile/test/angular-profile.spec.ts', ['@stynx-nyx/angular-i18n/testing']],
  ['packages-web/angular-trash/test/trash-confirm-flow.spec.ts', ['@stynx-nyx/angular-i18n/testing']],
  ['packages/data/test/unit/transaction.spec.ts', ['@stynx-nyx/testing']],
]);

function importedSpecifiers(source) {
  return [...source.matchAll(/\bimport\s+(?:[\s\S]*?\bfrom\s*)?(['"])([^'"]+)\1\s*;?/gu)]
    .map((match) => match[2]);
}

test('CTG-0006 migrated helper tests use only their published package subpaths', () => {
  for (const [file, expectedSpecifiers] of requiredImports) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const specifiers = importedSpecifiers(source);

    for (const specifier of expectedSpecifiers) {
      assert.equal(
        specifiers.includes(specifier),
        true,
        `${file} must import ${specifier}`,
      );
    }
    for (const specifier of specifiers) {
      assert.doesNotMatch(
        specifier,
        /(?:@stynx-nyx\/(?:angular-auth|angular-i18n|testing)\/[^'" ]*\/src\/|(?:^|\/)(?:packages-web\/(?:angular-auth|angular-i18n)|packages\/testing)\/[^'" ]*\/src\/)/u,
        `${file} must not import helper source paths (${specifier})`,
      );
    }
  }
});
