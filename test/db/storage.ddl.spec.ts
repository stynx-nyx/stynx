import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('storage schema DDL', () => {
  const ddl = readFileSync(join(__dirname, '../../db/ddl/03-storage.sql'), 'utf-8');

  it('defines storage schema and files table', () => {
    expect(ddl).toContain('CREATE SCHEMA storage');
    expect(ddl).toMatch(/CREATE TABLE storage\.files/);
  });

  it('enables row level security', () => {
    expect(ddl).toMatch(/create_tenant_enforcement_trigger\(\s*'storage'\s*,\s*'files'/i);
    expect(ddl).toMatch(/create_rls_policy\(\s*'storage'\s*,\s*'files'/i);
  });
});
