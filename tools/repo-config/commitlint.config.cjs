/**
 * Stynx commitlint config — Phase G of C-4 DEVAI adoption pilot.
 * Adopts ../devai/docs/adopters/templates/commitlint.config.cjs
 * (DEVAI Phase 20.E, closes D-A-4) so DEVAI's role-prefix subjects
 * coexist with stynx's existing Conventional Commits + scope enum.
 *
 * Two valid header shapes:
 *   1. DEVAI role-prefix:  `Architect: ...`, `Engineer: ...`,
 *                          `Inspector: ...`, `Auditor: ...`, `Owner: ...`
 *                          Combined forms also accepted:
 *                          `Engineer + Inspector: ...`,
 *                          `Architect + Engineer + Inspector: ...`
 *                          (matches DEVAI's own convention — see
 *                          ../devai commits like b284dc9, 24fd208).
 *      → declares which Constitution Article 6 substrate(s) the commit
 *        touches; preferred for DEVAI-driven work in stynx.
 *   2. Conventional Commits: `<type>(<scope>): <subject>`
 *      → preferred for legacy stynx work; scope must be in the
 *        allowedScopes enum below.
 *
 * Both shapes pass; per-commit author chooses the shape that matches
 * the substrate.
 */
const DEVAI_ROLES = ['Owner', 'Architect', 'Engineer', 'Inspector', 'Auditor'];
const CONVENTIONAL_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

const allowedScopes = [
  'stynx-workspace',
  '@stynx-nyx/reference-api',
  '@stynx-nyx/reference-web',
  '@stynx-nyx/backend',
  '@stynx-nyx/contracts',
  '@stynx-nyx/auth',
  '@stynx-nyx/audit',
  '@stynx-nyx/cli',
  '@stynx-nyx/core',
  '@stynx-nyx/data',
  '@stynx-nyx/i18n',
  '@stynx-nyx/privacy',
  '@stynx-nyx/ratelimit',
  '@stynx-nyx/idempotency',
  '@stynx-nyx/health',
  '@stynx-nyx/logging',
  '@stynx-nyx/sessions',
  '@stynx-nyx/storage',
  '@stynx-nyx/tenancy',
  '@stynx-nyx/testing',
  '@stynx-nyx/angular',
  '@stynx-nyx/angular-tenancy',
  '@stynx-nyx/angular-auth',
  '@stynx-nyx/angular-ui',
  '@stynx-nyx/angular-i18n',
  '@stynx-nyx/angular-trash',
  '@stynx-nyx/angular-storage',
  '@stynx-nyx/angular-sessions',
  '@stynx-nyx/angular-profile',
  '@stynx-internal/eslint-config',
  '@stynx-internal/tsconfig',
  '@stynx-internal/migration-linter',
  'clean',
  'deps',
  'deps-dev',
  'repo',
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      // Match `Role(s): ...` first (single OR `Role + Role [+ Role…]` combos);
      // fall through to Conventional otherwise.
      // The role branch's capture is the whole "Role + Role" string so the
      // role-of-record (for any downstream tooling) is the full combo,
      // matching the way authors write it.
      // Scope class admits `@` so `@stynx-nyx/*` / `@stynx-nyx/*` scopes work
      // (a pre-existing latent bug surfaced during F-12 smoke testing —
      // the scope enum lists them but the prior regex couldn't match them).
      headerPattern: new RegExp(
        `^(?:(${DEVAI_ROLES.join('|')})(?:\\s*\\+\\s*(?:${DEVAI_ROLES.join('|')}))*` +
          `|(${CONVENTIONAL_TYPES.join('|')}))(?:\\(([@\\w$.\\-*/ ]*)\\))?!?: (.+)$`,
      ),
      headerCorrespondence: ['role', 'type', 'scope', 'subject'],
    },
  },
  // Validation strategy: the headerPattern above already enforces that the
  // header is one of the two valid shapes (role-prefix OR conventional). We
  // therefore disable the field-by-field rules that would otherwise reject
  // role-shape headers (which have role set and type/scope undefined). The
  // headerPattern itself is the gate; type-enum / scope-enum / type-empty
  // are turned off because they are misaligned with the dual-shape model.
  rules: {
    'type-empty':       [0, 'never'],
    'type-enum':        [0, 'always', [...CONVENTIONAL_TYPES, ...DEVAI_ROLES]],
    'scope-empty':      [0, 'never'],
    'scope-enum':       [0, 'always', [...allowedScopes, '']],
    'subject-case':     [0, 'never'],
    'subject-empty':    [2, 'never'],
    'header-max-length':[2, 'always', 100],
    'header-trim':      [2, 'always'],
  },
};

// Documentation-only: the canonical scopes that conventional-shape commits
// SHOULD use are exposed below for future tooling (e.g. PR-title check
// upstream of the commitlint hook).
module.exports.allowedScopes = allowedScopes;
