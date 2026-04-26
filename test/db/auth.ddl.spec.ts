import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('auth schema DDL', () => {
  const ddl = readFileSync(join(__dirname, '../../db/ddl/01-auth.sql'), 'utf-8');

  it('defines auth schema', () => {
    expect(ddl).toContain('CREATE SCHEMA auth');
  });

  it('exposes tenancy membership with RLS policies', () => {
    expect(ddl).toMatch(/CREATE TABLE auth\.tenancy_members/);
    expect(ddl).toMatch(/create_rls_policy\(\s*'auth'\s*,\s*'tenancy_members'/i);
    expect(ddl).toMatch(/membership_isolation/);
  });

  it('sets up Cognito mirror tables', () => {
    expect(ddl).toMatch(/CREATE TABLE auth\.users/);
    expect(ddl).toMatch(/CREATE TABLE auth\.roles/);
    expect(ddl).toMatch(/CREATE TABLE auth\.groups/);
  });

  it('defines reusable tenant/RLS helper functions', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION auth\.create_tenant_enforcement_trigger/);
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION auth\.attach_tenant_enforcement_triggers/);
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION auth\.create_rls_policy/);
  });
});
