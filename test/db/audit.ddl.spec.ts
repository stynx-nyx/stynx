import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit schema DDL', () => {
  const ddl = readFileSync(join(__dirname, '../../db/ddl/02-audit.sql'), 'utf-8');

  it('creates audit.events table with metadata and pk columns', () => {
    expect(ddl).toMatch(/CREATE TABLE audit\.events/);
    expect(ddl).toContain('operation text NOT NULL');
    expect(ddl).toContain('metadata jsonb');
    expect(ddl).toContain('pk jsonb');
  });

  it('exposes audit.write helper', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.write/);
  });

  it('extracts primary key data for trigger events', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.extract_primary_key/);
  });
});
