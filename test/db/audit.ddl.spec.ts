import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit schema DDL', () => {
  const ddl = readFileSync(join(__dirname, '../../database/ddl/02-audit.sql'), 'utf-8');

  it('creates audit.events table with metadata and pk columns', () => {
    expect(ddl).toMatch(/CREATE TABLE audit\.events/);
    expect(ddl).toContain('operation text NOT NULL');
    expect(ddl).toContain('metadata jsonb');
    expect(ddl).toContain('pk jsonb');
    expect(ddl).toContain('previous_hash text');
    expect(ddl).toContain('row_hash text NOT NULL');
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.compute_event_hash/);
    expect(ddl).toMatch(/CREATE TRIGGER audit_events_set_row_hash/);
  });

  it('exposes audit.write helper', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.write/);
    expect(ddl).toContain('FOR UPDATE');
    expect(ddl).toContain('previous_hash');
  });

  it('extracts primary key data for trigger events', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.extract_primary_key/);
  });

  it('exposes audit.verify_chain helper', () => {
    expect(ddl).toMatch(/CREATE OR REPLACE FUNCTION audit\.verify_chain/);
    expect(ddl).toContain('RETURNS TABLE');
  });
});
