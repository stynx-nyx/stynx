import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auth schema DDL', () => {
  const ddl = readFileSync(join(__dirname, '../../db/ddl/01-auth.sql'), 'utf-8');

  it('defines auth schema', () => {
    expect(ddl).toContain('CREATE SCHEMA auth');
  });

  it('exposes tenancy membership with RLS policies', () => {
    expect(ddl).toMatch(/CREATE TABLE auth\.tenancy_members/);
    expect(ddl).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(ddl).toMatch(/CREATE POLICY tenant_isolation/);
  });

  it('sets up Cognito mirror tables', () => {
    expect(ddl).toMatch(/CREATE TABLE auth\.users/);
    expect(ddl).toMatch(/CREATE TABLE auth\.roles/);
    expect(ddl).toMatch(/CREATE TABLE auth\.groups/);
  });
});
