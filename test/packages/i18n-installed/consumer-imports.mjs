import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import { LocaleInterceptor } from '@stynx-nyx/i18n';
const require = createRequire(import.meta.url);
assert.equal(InvalidCredentialError, require('@stynx-nyx/contracts').InvalidCredentialError);
assert.equal(LocaleInterceptor, require('@stynx-nyx/i18n').LocaleInterceptor);
const fromAuth = createRequire(require.resolve('@stynx-nyx/auth'));
assert.equal(fromAuth('@stynx-nyx/contracts').InvalidCredentialError, InvalidCredentialError);
const root = realpathSync(resolve('node_modules')) + sep;
for (const name of [
  'contracts',
  'core',
  'data',
  'idempotency',
  'sessions',
  'auth',
  'i18n',
  'tenancy',
])
  assert.ok(realpathSync(require.resolve('@stynx-nyx/' + name)).startsWith(root));
console.log('I18N_INSTALLED_ESM_CJS_IDENTITY_PASS');
