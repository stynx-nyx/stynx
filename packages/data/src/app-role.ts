import type { Pool } from 'pg';
import { AppRoleConfigurationError, type AppRoleProperty } from './errors';
import type { StynxDataModuleOptions } from './tokens';

/** Application SQL role created by platform migration `0001_roles.sql` (ADR-OUTBOX-0003 D1). */
export const DEFAULT_APP_ROLE_NAME = 'stynx_app';
/** PostgreSQL identifier limit (`NAMEDATALEN - 1`), measured in UTF-8 bytes. */
export const APP_ROLE_NAME_MAX_BYTES = 63;
const APP_ROLE_IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_$]*$/u;

/**
 * Resolves `StynxDataModuleOptions.appRoleName` to the role the module trusts
 * as `current_user` on the application pool. The name is compared by exact
 * string equality and is never concatenated into SQL; it is validated once
 * as a non-empty PostgreSQL identifier of at most 63 bytes.
 */
export function resolveAppRoleName(options: Pick<StynxDataModuleOptions, 'appRoleName'>): string {
  const name = options.appRoleName ?? DEFAULT_APP_ROLE_NAME;
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    Buffer.byteLength(name, 'utf8') > APP_ROLE_NAME_MAX_BYTES ||
    !APP_ROLE_IDENTIFIER.test(name)
  ) {
    throw new AppRoleConfigurationError('appRoleName', { maxBytes: APP_ROLE_NAME_MAX_BYTES });
  }
  return name;
}

interface LiveAppRole {
  current_user: string;
  session_user: string;
  current_super: boolean;
  current_bypassrls: boolean;
  session_super: boolean;
  session_bypassrls: boolean;
}

/** Catalog probe of the application connection; names no role, reads nothing secret. */
const APP_ROLE_PROPERTY_SQL = `select current_user::text as current_user,
       session_user::text as session_user,
       c.rolsuper as current_super,
       c.rolbypassrls as current_bypassrls,
       s.rolsuper as session_super,
       s.rolbypassrls as session_bypassrls
  from pg_catalog.pg_roles c, pg_catalog.pg_roles s
 where c.rolname = current_user and s.rolname = session_user`;

function refuse(property: AppRoleProperty, roleName: string, actual?: string): never {
  throw new AppRoleConfigurationError(property, {
    role: roleName,
    ...(actual === undefined ? {} : { actual }),
  });
}

/** ADR-OUTBOX-0003 D1 item 7: the property check of one application connection. */
export function assertAppRoleProperties(live: LiveAppRole | undefined, roleName: string): void {
  if (!live || live.current_user !== roleName) refuse('current_user', roleName, live?.current_user);
  if (live.current_super) refuse('rolsuper', roleName);
  if (live.current_bypassrls) refuse('rolbypassrls', roleName);
  if (live.session_user !== live.current_user) {
    if (live.session_super) refuse('session_user.rolsuper', roleName, live.session_user);
    if (live.session_bypassrls) refuse('session_user.rolbypassrls', roleName, live.session_user);
  }
}

/**
 * Latch that proves the application role's properties on an application
 * connection once, before the pool serves its first app-role transaction.
 * A failed check is retried on the next acquisition and fails typed until
 * the role conforms; an unreachable database at bootstrap defers, never skips.
 */
export class AppRoleVerifier {
  private verified = false;
  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly pool: () => Pick<Pool, 'connect'>,
    readonly roleName: string,
  ) {}

  get isVerified(): boolean {
    return this.verified;
  }

  ensure(): Promise<void> {
    if (this.verified) return Promise.resolve();
    if (!this.inFlight) {
      this.inFlight = this.run().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  /** Bootstrap attempt: a property failure prevents startup; a connection failure defers to `ensure()`. */
  async prime(): Promise<void> {
    try {
      await this.ensure();
    } catch (error) {
      if (error instanceof AppRoleConfigurationError) throw error;
    }
  }

  private async run(): Promise<void> {
    const client = await this.pool().connect();
    try {
      const result = await client.query<LiveAppRole>(APP_ROLE_PROPERTY_SQL);
      assertAppRoleProperties(result.rows[0], this.roleName);
      this.verified = true;
    } finally {
      client.release();
    }
  }
}
