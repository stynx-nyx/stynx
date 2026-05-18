import { PgSessionDbContextApplier } from '../../../packages/backend/src/db-context/pg-session-db-context.applier';

describe('PgSessionDbContextApplier', () => {
  it('applies row_security and session keys with compatibility mappings', async () => {
    const query = vi.fn(async () => ({}));
    const applier = new PgSessionDbContextApplier({ defaultLanguage: 'pt-BR' });

    await applier.apply(
      { query },
      {
        userId: 'user-1',
        roles: ['admin', ' manager '],
        permissions: ['read:all'],
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
        requestId: 'req-1',
        extras: {
          orgCnpj: '12345678000190',
          locale: 'en-US',
        },
      },
    );

    expect(query).toHaveBeenCalledWith('SET row_security = on');
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.app_user_id', 'user-1']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['auth.app_user_id', 'user-1']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.roles', 'admin,manager']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['auth.roles', 'admin,manager']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.permissions', 'read:all']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.current_tenant', 'tenant-1']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['auth.current_tenant', 'tenant-1']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['app.current_tenant', 'tenant-1']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.lang', 'en-US']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['auth.lang', 'en-US']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['stynx.org_cnpj', '12345678000190']);
    expect(query).toHaveBeenCalledWith('select set_config($1, $2, false)', ['auth.org_cnpj', '12345678000190']);
  });

  it('can skip missing values when clearMissing=false', async () => {
    const query = vi.fn(async () => ({}));
    const applier = new PgSessionDbContextApplier({
      enableRowSecurity: false,
      clearMissing: false,
    });

    await applier.apply({ query }, {});

    expect(query).not.toHaveBeenCalled();
  });
});
