import type { PlatformRoleNames } from '@stynx-nyx/data';

/**
 * Product role names a test app bootstraps and connects as (S-18). Default:
 * the STYNX platform roles of `0001_roles.sql`.
 */
export type TestAppRoleNames = PlatformRoleNames;

/** The STYNX platform roles; `createTestApp` uses them unless given others. */
export const DEFAULT_TEST_APP_ROLES: Readonly<TestAppRoleNames> = Object.freeze({
  owner: 'stynx_owner',
  app: 'stynx_app',
  reader: 'stynx_reader',
});

const ROLE_PREFIX_PATTERN = /^[a-z_][a-z0-9_]*$/u;

/**
 * The role prefix shared by `roles`, which must be exactly
 * `<prefix>_owner`, `<prefix>_app` and `<prefix>_reader` (S-18): the
 * platform migrations take a prefix, not arbitrary names.
 */
export function testAppRolePrefix(roles: TestAppRoleNames): string {
  const prefix = roles.app.endsWith('_app') ? roles.app.slice(0, -'_app'.length) : '';
  if (
    !ROLE_PREFIX_PATTERN.test(prefix) ||
    roles.owner !== `${prefix}_owner` ||
    roles.reader !== `${prefix}_reader`
  ) {
    throw new TypeError(
      'Invalid test app roles: expected <prefix>_owner, <prefix>_app and <prefix>_reader with one lower-case prefix',
    );
  }
  return prefix;
}
