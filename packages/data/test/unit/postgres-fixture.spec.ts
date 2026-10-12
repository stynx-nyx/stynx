import { Client } from 'pg';
import { asAppRole, withPostgresCredentials } from '../support/postgres';

describe('PostgreSQL fixture direct-role connection identity', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['postgresql://owner@/fixture?host=%2Ftmp&user=old&password=old', '/tmp'],
    ['postgresql://owner@[::1]:5544/fixture?user=old&password=old', '::1'],
  ])('binds an explicit password independently of ambient fixture credentials: %s', (uri, host) => {
    vi.stubEnv('STYNX_TEST_PG_PASSWORD', 'different-ambient-password');
    const password = 'owner-secret:@/% é';
    const client = new Client({
      connectionString: withPostgresCredentials(uri, { user: 'owner_é', password }),
    });
    expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
      host,
      database: 'fixture',
      user: 'owner_é',
      password,
    });
  });

  it('preserves the Unix socket endpoint and application settings while changing the login', () => {
    vi.stubEnv('STYNX_TEST_PG_PASSWORD', 'fixture-password');
    const client = new Client({
      connectionString: asAppRole(
        'postgresql://owner@/fixture%20%C3%A9?host=%2Ftmp%2Fsocket%20dir&application_name=fixture%20probe&options=-c%20statement_timeout%3D1000',
      ),
    });
    expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
      host: '/tmp/socket dir',
      database: 'fixture é',
      user: 'stynx_app',
      password: 'fixture-password',
      application_name: 'fixture probe',
      options: '-c statement_timeout=1000',
    });
  });

  it('preserves TCP IPv6, port and SSL settings with escaped login credentials', () => {
    const password = 'p@ss:%/ ?#é';
    vi.stubEnv('STYNX_TEST_PG_PASSWORD', password);
    const client = new Client({
      connectionString: asAppRole(
        'postgresql://owner:old@[::1]:5544/fixture?sslmode=disable&application_name=IPv6',
        'aplicação_%',
      ),
    });
    expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
      host: '::1',
      port: 5544,
      database: 'fixture',
      user: 'aplicação_%',
      password,
      ssl: false,
      application_name: 'IPv6',
    });
  });

  it('does not let query-string credentials retain the owner identity', () => {
    vi.stubEnv('STYNX_TEST_PG_PASSWORD', 'restricted-password');
    const client = new Client({
      connectionString: asAppRole(
        'postgres://owner:old@localhost/fixture?user=owner&password=owner-secret&host=127.0.0.1',
        'restricted_app',
      ),
    });
    expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
      host: '127.0.0.1',
      database: 'fixture',
      user: 'restricted_app',
      password: 'restricted-password',
    });
  });

  it('supports the socket URI form with no original login authority', () => {
    vi.stubEnv('STYNX_TEST_PG_PASSWORD', 'restricted-password');
    const client = new Client({
      connectionString: asAppRole('postgresql:///fixture?host=%2Ftmp', 'restricted_app'),
    });
    expect(Reflect.get(client, 'connectionParameters')).toMatchObject({
      host: '/tmp',
      database: 'fixture',
      user: 'restricted_app',
      password: 'restricted-password',
    });
  });

  it('refuses an unrelated URI without exposing its credentials', () => {
    expect(() => asAppRole('https://owner:owner-secret@example.test/db')).toThrow(
      new TypeError('Expected PostgreSQL connection URI'),
    );
  });
});
