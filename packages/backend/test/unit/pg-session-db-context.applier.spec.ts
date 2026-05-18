import { PgSessionDbContextApplier } from '../../src/db-context/pg-session-db-context.applier';

function makeClient() {
  return { query: jest.fn(async () => undefined) };
}

describe('PgSessionDbContextApplier', () => {
  it('issues SET row_security = on by default', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier();
    await applier.apply(client, { tenantId: 'tenant-1' });
    expect(client.query).toHaveBeenCalledWith('SET row_security = on');
  });

  it('skips SET row_security when enableRowSecurity=false', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, { tenantId: 'tenant-1' });
    const rsCall = client.query.mock.calls.find(([sql]) => sql === 'SET row_security = on');
    expect(rsCall).toBeUndefined();
  });

  it('writes tenantId via set_config to all default tenant setting names', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, { tenantId: 'tenant-7' });
    const tenantCalls = client.query.mock.calls.filter(
      ([sql, params]) =>
        sql === 'select set_config($1, $2, false)' &&
        Array.isArray(params) &&
        ['stynx.current_tenant', 'auth.current_tenant', 'app.current_tenant'].includes(
          params[0] as string,
        ),
    );
    expect(tenantCalls).toHaveLength(3);
    for (const [, params] of tenantCalls) {
      expect((params as unknown[])[1]).toBe('tenant-7');
    }
  });

  it('writes userId, correlationId, requestId via set_config', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, {
      tenantId: 't',
      userId: 'user-1',
      correlationId: 'corr-1',
      requestId: 'req-1',
    });
    const params = client.query.mock.calls.map(
      ([, p]) => (Array.isArray(p) ? p : []) as unknown[],
    );
    const settings = new Map<string, unknown>(params.map((p) => [p[0] as string, p[1]]));
    expect(settings.get('stynx.app_user_id')).toBe('user-1');
    expect(settings.get('stynx.correlation_id')).toBe('corr-1');
    expect(settings.get('stynx.request_id')).toBe('req-1');
  });

  it('joins roles and permissions arrays into comma-separated strings', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, {
      tenantId: 't',
      roles: ['admin', 'member'],
      permissions: ['doc:read', 'doc:write'],
    });
    const params = client.query.mock.calls.map(([, p]) => p as unknown[]);
    const settings = new Map<string, unknown>(params.map((p) => [p[0] as string, p[1]]));
    expect(settings.get('stynx.roles')).toBe('admin,member');
    expect(settings.get('stynx.permissions')).toBe('doc:read,doc:write');
  });

  it('clears settings to empty string when value is undefined and clearMissing=true (default)', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, { tenantId: 't' });
    const params = client.query.mock.calls.map(([, p]) => p as unknown[]);
    const settings = new Map<string, unknown>(params.map((p) => [p[0] as string, p[1]]));
    expect(settings.get('stynx.app_user_id')).toBe('');
    expect(settings.get('stynx.roles')).toBe('');
    expect(settings.get('stynx.lang')).toBe('');
  });

  it('skips set_config for absent values when clearMissing=false', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      clearMissing: false,
    });
    await applier.apply(client, { tenantId: 't' });
    const params = client.query.mock.calls.map(([, p]) => p as unknown[]);
    const settings = new Map<string, unknown>(params.map((p) => [p[0] as string, p[1]]));
    expect(settings.has('stynx.app_user_id')).toBe(false);
    expect(settings.has('stynx.roles')).toBe(false);
  });

  it('honors custom setting name overrides and deduplicates', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      settings: { tenantId: ['my.tenant', 'my.tenant', '  '] },
    });
    await applier.apply(client, { tenantId: 't-custom' });
    const tenantCalls = client.query.mock.calls.filter(
      ([, p]) => Array.isArray(p) && (p[0] as string) === 'my.tenant',
    );
    expect(tenantCalls).toHaveLength(1);
  });

  it('resolves language from extras["lang"] over defaultLanguage', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      defaultLanguage: 'pt-BR',
    });
    await applier.apply(client, { tenantId: 't', extras: { lang: 'en-US' } });
    const settings = new Map<string, unknown>(
      client.query.mock.calls.map(([, p]) => [(p as unknown[])[0] as string, (p as unknown[])[1]]),
    );
    expect(settings.get('stynx.lang')).toBe('en-US');
  });

  it('falls back to defaultLanguage when no extras key matches', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      defaultLanguage: 'pt-BR',
    });
    await applier.apply(client, { tenantId: 't', extras: {} });
    const settings = new Map<string, unknown>(
      client.query.mock.calls.map(([, p]) => [(p as unknown[])[0] as string, (p as unknown[])[1]]),
    );
    expect(settings.get('stynx.lang')).toBe('pt-BR');
  });

  it('reads orgCnpj from extras["orgCnpj"] or ["org_cnpj"]', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, { tenantId: 't', extras: { org_cnpj: '12345678000199' } });
    const settings = new Map<string, unknown>(
      client.query.mock.calls.map(([, p]) => [(p as unknown[])[0] as string, (p as unknown[])[1]]),
    );
    expect(settings.get('stynx.org_cnpj')).toBe('12345678000199');
  });

  it('honors custom languageExtraKeys ordering', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      languageExtraKeys: ['preferredLanguage', 'lang'],
    });
    await applier.apply(client, {
      tenantId: 't',
      extras: { lang: 'en', preferredLanguage: 'pt-BR' },
    });
    const settings = new Map<string, unknown>(
      client.query.mock.calls.map(([, p]) => [(p as unknown[])[0] as string, (p as unknown[])[1]]),
    );
    expect(settings.get('stynx.lang')).toBe('pt-BR');
  });

  it('skips applying when settings list is empty (zero-length override)', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      settings: { userId: [] },
    });
    await applier.apply(client, { tenantId: 't', userId: 'u' });
    const userCalls = client.query.mock.calls.filter(
      ([, p]) => Array.isArray(p) && ['stynx.app_user_id', 'auth.app_user_id'].includes(p[0] as string),
    );
    expect(userCalls).toHaveLength(0);
  });

  it('coerces non-string scalar values to strings via String()', async () => {
    const client = makeClient();
    const applier = new PgSessionDbContextApplier({ enableRowSecurity: false });
    await applier.apply(client, { tenantId: 't', userId: 42 as unknown as string });
    const settings = new Map<string, unknown>(
      client.query.mock.calls.map(([, p]) => [(p as unknown[])[0] as string, (p as unknown[])[1]]),
    );
    expect(settings.get('stynx.app_user_id')).toBe('42');
  });
});
