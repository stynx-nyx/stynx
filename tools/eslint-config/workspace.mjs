// Options that bind the shared factories to the STYNX monorepo itself. Only
// STYNX's own `--config ../../tools/eslint-config/*.mjs` entry points use
// them; this module is not exported.
//
// `strict: false` keeps the levels STYNX lints with today: `no-explicit-any`
// and four `no-unsafe-*` rules off, `boundaries/dependencies` allow-by-default
// and no `no-authored-cjs`. `stynx/require-idempotent-route-decorator` is at
// error in every profile since SM-13. Migration items SM-11, SM-12 and SM-01
// move STYNX onto the remaining strict (published default) levels and then
// delete this switch.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const boundaryElements = [
  { type: 'core', pattern: 'packages/core/src/**' },
  { type: 'contracts', pattern: 'packages/contracts/src/**' },
  { type: 'foundation', pattern: 'packages/{tenancy,logging,health}/src/**' },
  { type: 'data', pattern: 'packages/data/src/**' },
  { type: 'sessions', pattern: 'packages/sessions/src/**' },
  { type: 'auth', pattern: 'packages/auth/src/**' },
  { type: 'platform', pattern: 'packages/{audit,storage,ratelimit,idempotency,backend}/src/**' },
  { type: 'experience', pattern: 'packages/{privacy,i18n}/src/**' },
  { type: 'tooling', pattern: 'packages/{testing,cli}/src/**' },
  { type: 'web', pattern: 'packages-web/*/src/**' },
  { type: 'app', pattern: 'apps/*/src/**' },
];

export const stynxWorkspaceOptions = {
  strict: false,
  boundaries: { rootPath: workspaceRoot, elements: boundaryElements },
};
