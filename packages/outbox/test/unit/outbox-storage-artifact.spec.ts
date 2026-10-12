import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderOutboxStorage } from '../../src/index';

// ADR-OUTBOX-0003 D2/D3; ADR-OUTBOX-0004 D4: the published renderer is a
// deterministic, offline binding boundary, not an arbitrary SQL template port.
describe('outbox standalone storage artifact', () => {
  it('renders deterministic complete default artifacts with objects and role bindings separated', () => {
    const artifact = renderOutboxStorage();
    expect(renderOutboxStorage()).toEqual(artifact);
    expect(artifact.binding).toEqual({
      ownerRole: 'stynx_owner',
      appRole: 'stynx_app',
      readerRole: 'stynx_reader',
      tenantTable: { schema: 'tenancy', table: 'tenants', column: 'id' },
    });
    expect(artifact.contractVersion).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(artifact.packageVersion).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/u);
    expect(artifact.packageVersion).toBe(
      JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')).version,
    );
    expect(artifact.manifest).toEqual(expect.any(Object));
    expect(artifact.objectsSql).toMatch(/event_retirements/u);
    expect(artifact.objectsSql).toMatch(/FORCE ROW LEVEL SECURITY/iu);
    expect(artifact.objectsSql).not.toMatch(/\baudit\s*\./iu);
    expect(artifact.roleBindingsSql).toMatch(/stynx_app/u);
    expect(artifact.roleBindingsSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)\b/iu);
  });

  it('resolves a consumer tenant table and independent roles without platform tenancy or audit dependencies', () => {
    const artifact = renderOutboxStorage({
      ownerRole: 'consumer_owner',
      appRole: 'role_app_backend',
      readerRole: null,
      tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
    });
    expect(artifact.binding).toEqual({
      ownerRole: 'consumer_owner',
      appRole: 'role_app_backend',
      readerRole: null,
      tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
    });
    expect(artifact.objectsSql).toMatch(/"auth"\s*\.\s*"tenants"/u);
    expect(artifact.objectsSql).toMatch(/"tenant_uuid"/u);
    expect(artifact.objectsSql).not.toMatch(/\btenancy\s*\.|"tenancy"\s*\./iu);
    expect(artifact.objectsSql).not.toMatch(/\baudit\s*\./iu);
    expect(artifact.roleBindingsSql).toContain('role_app_backend');
    expect(artifact.roleBindingsSql).not.toContain('stynx_reader');
  });

  it.each([
    { ownerRole: '' },
    { appRole: 'app; grant all to public' },
    { readerRole: 'reader\0evil' },
    { ownerRole: 'é'.repeat(32) },
    { tenantTable: { schema: 'auth.evil', table: 'tenants', column: 'id' } },
    { tenantTable: { schema: 'auth', table: 'tenants; drop schema auth', column: 'id' } },
    { tenantTable: { schema: 'auth', table: 'tenants', column: 'id)' } },
  ])('refuses malformed binding identifiers before producing SQL: %j', (options) => {
    expect(() => renderOutboxStorage(options)).toThrow();
  });
});

it('keeps default-role words in tenant identifiers independent of custom role substitution', () => {
  const artifact = renderOutboxStorage({
    ownerRole: 'consumer_owner',
    appRole: 'consumer_app',
    readerRole: null,
    tenantTable: { schema: 'stynx_app', table: 'stynx_reader', column: 'stynx_owner' },
  });
  expect(artifact.objectsSql).toContain('REFERENCES "stynx_app"."stynx_reader"("stynx_owner")');
  const foreignKeys = artifact.manifest.catalog.filter(
    (entry) => entry.kind === 'constraint' && entry.value.referencedSchema === 'stynx_app',
  );
  expect(foreignKeys.length).toBeGreaterThan(0);
  for (const entry of foreignKeys) {
    expect(entry.value.referencedTable).toBe('stynx_reader');
    expect(entry.value.referencedColumns).toEqual(['stynx_owner']);
  }
});
