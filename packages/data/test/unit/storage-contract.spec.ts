import { quoteStorageIdentifier, resolveStorageRoleBinding } from '../../src/storage-contract.js';

// ADR-OUTBOX-0004 D4: identifiers cannot inject SQL or alias through PostgreSQL
// truncation, and application/reader roles cannot inherit owner authority by name.
describe('closed consumer-storage binding', () => {
  it('resolves defaults and an independent Unicode binding without mutating caller options', () => {
    expect(resolveStorageRoleBinding()).toEqual({
      ownerRole: 'stynx_owner',
      appRole: 'stynx_app',
      readerRole: 'stynx_reader',
      tenantTable: { schema: 'tenancy', table: 'tenants', column: 'id' },
    });
    const options = {
      ownerRole: 'proprietário',
      appRole: 'role_app_backend',
      readerRole: null,
      tenantTable: { schema: 'auth', table: 'tenants', column: 'tenant_uuid' },
    };
    const original = structuredClone(options);
    expect(resolveStorageRoleBinding(options)).toEqual(options);
    expect(options).toEqual(original);
    expect(quoteStorageIdentifier('é'.repeat(31) + 'x')).toBe(`"${'é'.repeat(31)}x"`);
    expect(quoteStorageIdentifier('Order')).toBe('"Order"');
  });

  it.each([
    '',
    'auth.tenants',
    'a;b',
    'a"b',
    'a b',
    'a\0b',
    '\ud800',
    'é'.repeat(32),
    'x'.repeat(64),
  ])('rejects an unsafe or truncating identifier %j', (identifier) => {
    expect(() => quoteStorageIdentifier(identifier)).toThrow(RangeError);
  });

  it.each([
    { ownerRole: 'same', appRole: 'same' },
    { ownerRole: 'same', readerRole: 'same' },
    { appRole: 'same', readerRole: 'same' },
    { ownerRole: 'PUBLIC' },
    { appRole: 'public' },
    { readerRole: 'Public' },
    { appRole: null },
    { ownerRole: null },
    { readerRole: 17 },
    { tenantTable: null },
    { tenantTable: { schema: 'auth', table: 'tenants' } },
    { tenantTable: { schema: 'auth', table: 'tenants', column: 'id', sql: 'injected' } },
    { schema: 'another_schema' },
  ])('refuses an ambiguous, privileged or incomplete binding: %j', (options) => {
    expect(() => resolveStorageRoleBinding(options as never)).toThrow(RangeError);
  });
});
