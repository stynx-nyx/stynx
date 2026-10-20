/**
 * The PostgreSQL runtime a test app runs against (02 §6, D-011). The harness
 * or rail supplies `DATABASE_URL` in both modes: bare, a server the developer
 * started; docker, the rail's Compose `postgres` service. This package never
 * starts a container and never falls back to another runtime.
 */
export const MISSING_DATABASE_URL_MESSAGE =
  'createTestApp requires DATABASE_URL: the PostgreSQL server of the declared runtime ' +
  '(bare: a server you started; docker: the Compose postgres service the rail starts). ' +
  '@stynx-nyx/testing starts no database.';

/** Returns the supplied `DATABASE_URL`, or throws when the runtime supplied none. */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(MISSING_DATABASE_URL_MESSAGE);
  }
  parsePostgresUri(url);
  return url;
}

interface PostgresUri {
  readonly scheme: string;
  readonly user: string | undefined;
  readonly password: string | undefined;
  /** `host[:port]`; empty for a Unix-socket URI (`?host=/dir`). */
  readonly endpoint: string;
  readonly parameters: URLSearchParams;
}

// WHATWG URL rejects PostgreSQL's empty-host Unix-socket authority, so the
// URI is split by hand; the endpoint and query are kept as given.
const POSTGRES_URI = /^(postgres(?:ql)?:\/\/)([^/?#]*)(?:\/[^?#]*)?(?:\?([^#]*))?$/u;

function parsePostgresUri(uri: string): PostgresUri {
  const parts = POSTGRES_URI.exec(uri);
  if (!parts) {
    throw new TypeError('DATABASE_URL must be a postgres:// or postgresql:// connection URI');
  }
  const [, scheme = '', authority = '', query] = parts;
  const at = authority.lastIndexOf('@');
  const userInfo = at >= 0 ? authority.slice(0, at) : undefined;
  const colon = userInfo?.indexOf(':') ?? -1;
  return {
    scheme,
    user:
      userInfo === undefined
        ? undefined
        : decodeURIComponent(colon >= 0 ? userInfo.slice(0, colon) : userInfo),
    password:
      userInfo !== undefined && colon >= 0 ? decodeURIComponent(userInfo.slice(colon + 1)) : undefined,
    endpoint: authority.slice(at + 1),
    parameters: new URLSearchParams(query),
  };
}

function formatPostgresUri(uri: PostgresUri, database: string): string {
  const userInfo =
    uri.user === undefined
      ? ''
      : `${encodeURIComponent(uri.user)}${uri.password === undefined ? '' : `:${encodeURIComponent(uri.password)}`}@`;
  return `${uri.scheme}${userInfo}${uri.endpoint}/${encodeURIComponent(database)}?${uri.parameters.toString()}`;
}

/** The login a URI names, from its userinfo or its `user`/`password` parameters. */
export function postgresLogin(uri: string): { user?: string; password?: string } {
  const parsed = parsePostgresUri(uri);
  const user = parsed.parameters.get('user') ?? parsed.user;
  const password = parsed.parameters.get('password') ?? parsed.password;
  return {
    ...(user === undefined ? {} : { user }),
    ...(password === undefined ? {} : { password }),
  };
}

/** `uri` retargeted at `database`, tagged with `applicationName`, optionally as another login. */
export function postgresUriFor(
  uri: string,
  database: string,
  applicationName: string,
  login?: { readonly user: string; readonly password: string },
): string {
  const parsed = parsePostgresUri(uri);
  const parameters = new URLSearchParams(parsed.parameters);
  parameters.set('application_name', applicationName);
  if (login) {
    // pg gives these parameters precedence over the userinfo; a rebound
    // login must not keep a privileged query-string user.
    parameters.delete('user');
    parameters.delete('password');
  }
  return formatPostgresUri(
    {
      ...parsed,
      ...(login ? { user: login.user, password: login.password } : {}),
      parameters,
    },
    database,
  );
}

/** Where a URI points, without its credentials, for error messages. */
export function describePostgresEndpoint(uri: string): string {
  const parsed = parsePostgresUri(uri);
  const socket = parsed.parameters.get('host');
  return parsed.endpoint || (socket ? `socket ${socket}` : 'the default socket');
}
