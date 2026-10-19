/**
 * Product role prefix of the platform migrations (S-18): a product bootstraps
 * and connects as `<prefix>_owner`, `<prefix>_app` and `<prefix>_reader`.
 * The applied migration files are immutable and name the STYNX roles, so the
 * runner substitutes the prefix at apply time instead of rewriting them.
 */

/** Role prefix the platform migration files are written with. */
export const DEFAULT_ROLE_PREFIX = 'stynx';

/** The three product roles created by platform migration `0001_roles.sql`. */
export interface PlatformRoleNames {
  /** Migration owner (`BYPASSRLS`); application code never connects as it. */
  readonly owner: string;
  /** Application role (`NOBYPASSRLS`); app pools log in as it. */
  readonly app: string;
  /** Read-only role (`NOBYPASSRLS`). */
  readonly reader: string;
}

/** Lower-case unquoted PostgreSQL identifier, so substituted SQL stays unquoted. */
const ROLE_PREFIX_PATTERN = /^[a-z_][a-z0-9_]*$/u;
/** `NAMEDATALEN - 1` minus the longest suffix, `_reader`. */
export const ROLE_PREFIX_MAX_LENGTH = 63 - '_reader'.length;

/**
 * Exactly the role identifiers of the platform migrations. Schema names,
 * GUCs (`stynx.*`), comments such as `stynx:archive-source` and any other
 * `stynx` text are not matched.
 */
const PLATFORM_ROLE_IDENTIFIER = /\bstynx_(owner|app|reader)\b/gu;

/** Validates a role prefix; returns it unchanged. */
export function assertRolePrefix(prefix: string): string {
  if (
    typeof prefix !== 'string' ||
    prefix.length > ROLE_PREFIX_MAX_LENGTH ||
    !ROLE_PREFIX_PATTERN.test(prefix)
  ) {
    throw new TypeError(
      `Invalid role prefix: expected a lower-case PostgreSQL identifier of at most ${ROLE_PREFIX_MAX_LENGTH} characters`,
    );
  }
  return prefix;
}

/** The product role names for `prefix` (default `stynx`). */
export function platformRoleNames(prefix: string = DEFAULT_ROLE_PREFIX): PlatformRoleNames {
  const valid = assertRolePrefix(prefix);
  return { owner: `${valid}_owner`, app: `${valid}_app`, reader: `${valid}_reader` };
}

/**
 * Rewrites the platform role identifiers of `sql` to `prefix`. With the
 * default prefix the result is the input, byte for byte.
 */
export function applyRolePrefix(sql: string, prefix: string = DEFAULT_ROLE_PREFIX): string {
  const valid = assertRolePrefix(prefix);
  if (valid === DEFAULT_ROLE_PREFIX) {
    return sql;
  }
  return sql.replace(PLATFORM_ROLE_IDENTIFIER, (_identifier, role: string) => `${valid}_${role}`);
}
