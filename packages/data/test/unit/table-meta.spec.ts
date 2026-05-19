// @ts-nocheck
import { pgSchema, pgTable, text } from 'drizzle-orm/pg-core';
import {
  getTableMeta,
  mirrorQualifiedName,
  qualifiedName,
  quoteIdent,
} from '../../src/internal/table-meta';

describe('table metadata helpers', () => {
  it('quotes identifiers and builds qualified relation names', () => {
    expect(quoteIdent('tenant"docs')).toBe('"tenant""docs"');
    expect(qualifiedName('public', 'document')).toBe('"public"."document"');
    expect(mirrorQualifiedName('storage', 'documents')).toBe('"archive"."storage_documents"');
  });

  it('defaults unschemed tables to public metadata', () => {
    const table = pgTable('plain_docs', {
      id: text('id'),
      title: text('title'),
    });

    expect(getTableMeta(table)).toEqual({
      schema: 'public',
      table: 'plain_docs',
      qualifiedName: '"public"."plain_docs"',
      mirrorQualifiedName: '"archive"."public_plain_docs"',
      columnNames: ['id', 'title'],
    });
  });

  it('uses explicit schema metadata when present', () => {
    const audit = pgSchema('audit');
    const table = audit.table('events', {
      id: text('id'),
      message: text('message'),
    });

    expect(getTableMeta(table)).toMatchObject({
      schema: 'audit',
      table: 'events',
      qualifiedName: '"audit"."events"',
      mirrorQualifiedName: '"archive"."audit_events"',
      columnNames: ['id', 'message'],
    });
  });
});
