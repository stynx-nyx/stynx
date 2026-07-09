import {
  auditExpect,
  expectInArchive,
  expectNotInLive,
  expectRestored,
  expectRLSIsolated,
} from '@stynx-nyx/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordNotes, records } from '../../../src/sample/schema';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

interface RecordBody {
  id: string;
  title: string;
  email: string;
  status: string;
  tenantId?: string;
  tenant_id?: string;
}

interface NoteBody {
  id: string;
  recordId: string;
  label: string;
  detail: string;
  code: string;
  tenantId?: string;
  tenant_id?: string;
}

describe('@stynx-nyx/reference-api e2e records and notes', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let recordId = '';
  let noteId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e();
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('runs happy CRUD for records and notes with audit rows', async () => {
    const record = (await adminA.post('/records').send({
      title: 'Records E2E',
      email: 'records-e2e@example.com',
      status: 'pending',
    }).expect(201)).body as RecordBody;
    recordId = record.id;
    expect(record.title).toBe('Records E2E');
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: recordId,
    });

    const updatedRecord = (await adminA.patch(`/records/${recordId}`).send({
      title: 'Records E2E Updated',
      status: 'active',
    }).expect(200)).body as RecordBody;
    expect(updatedRecord).toEqual(expect.objectContaining({
      id: recordId,
      title: 'Records E2E Updated',
      status: 'active',
    }));
    await auditExpect(context.database, 'record', 'sample.record.update', {
      schema: 'sample',
      rowId: recordId,
    });

    const note = (await adminA.post('/record-notes').send({
      recordId,
      kind: 'primary',
      label: 'Records E2E note',
      detail: 'Initial detail',
      region: 'BR',
      code: 'RN-E2E-1',
    }).expect(201)).body as NoteBody;
    noteId = note.id;
    expect(note.recordId).toBe(recordId);
    await auditExpect(context.database, 'record_note', 'sample.record-note.create', {
      schema: 'sample',
      rowId: noteId,
    });

    const updatedNote = (await adminA.patch(`/record-notes/${noteId}`).send({
      label: 'Records E2E note updated',
      detail: 'Updated detail',
      code: 'RN-E2E-2',
    }).expect(200)).body as NoteBody;
    expect(updatedNote).toEqual(expect.objectContaining({
      id: noteId,
      label: 'Records E2E note updated',
      detail: 'Updated detail',
      code: 'RN-E2E-2',
    }));
    await auditExpect(context.database, 'record_note', 'sample.record-note.update', {
      schema: 'sample',
      rowId: noteId,
    });

    await adminA.get(`/records/${recordId}`).expect(200).expect(({ body }: { body: RecordBody }) => {
      expect(body.id).toBe(recordId);
    });
    await adminA.get(`/record-notes/${noteId}`).expect(200).expect(({ body }: { body: NoteBody }) => {
      expect(body.id).toBe(noteId);
    });
    await adminA.get('/records').expect(200).expect(({ body }: { body: RecordBody[] }) => {
      expect(body.some((row) => row.id === recordId)).toBe(true);
    });
    await adminA.get('/record-notes').expect(200).expect(({ body }: { body: NoteBody[] }) => {
      expect(body.some((row) => row.id === noteId)).toBe(true);
    });
  });

  it('denies write routes to the read-only viewer actor', async () => {
    await viewerA.post('/records').send({
      title: 'Viewer denied',
      email: 'viewer-denied@example.com',
    }).expect(403);

    await viewerA.patch(`/record-notes/${noteId}`).send({
      label: 'Viewer denied update',
    }).expect(403);
  });

  it('isolates records and notes across tenants through HTTP and RLS', async () => {
    const otherRecord = (await adminB.post('/records').send({
      title: 'Tenant B record',
      email: 'tenant-b-record@example.com',
    }).expect(201)).body as RecordBody;
    const otherNote = (await adminB.post('/record-notes').send({
      recordId: otherRecord.id,
      kind: 'primary',
      label: 'Tenant B note',
      detail: 'Tenant B detail',
      region: 'BR',
      code: 'TENANT-B-NOTE',
    }).expect(201)).body as NoteBody;

    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: otherRecord.id,
    });
    await auditExpect(context.database, 'record_note', 'sample.record-note.create', {
      schema: 'sample',
      rowId: otherNote.id,
    });

    await adminA.get(`/records/${otherRecord.id}`).expect(404);
    await adminA.get(`/record-notes/${otherNote.id}`).expect(404);
    await adminA.get('/records').expect(200).expect(({ body }: { body: RecordBody[] }) => {
      expect(body.some((row) => row.id === otherRecord.id)).toBe(false);
    });
    await adminA.get('/record-notes').expect(200).expect(({ body }: { body: NoteBody[] }) => {
      expect(body.some((row) => row.id === otherNote.id)).toBe(false);
    });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<RecordBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.record',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<NoteBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.record_note',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });

  it('soft-deletes and restores notes and records with archive assertions', async () => {
    await adminA.delete(`/record-notes/${noteId}`).expect(200);
    await auditExpect(context.database, 'record_note', 'sample.record-note.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, recordNotes, noteId);
    await expectNotInLive(context.database, recordNotes, noteId);

    await adminA.post(`/record-notes/${noteId}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'record_note', 'sample.record-note.restore', {
      schema: 'sample',
      rowId: noteId,
    });
    await expectRestored(context.database, recordNotes, noteId);

    const recordForRestore = (await adminA.post('/records').send({
      title: 'Record restore target',
      email: 'record-restore-target@example.com',
    }).expect(201)).body as RecordBody;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: recordForRestore.id,
    });

    await adminA.delete(`/records/${recordForRestore.id}`).expect(200);
    await auditExpect(context.database, 'record', 'sample.record.soft-delete', {
      schema: 'sample',
    });
    await expectInArchive(context.database, records, recordForRestore.id);
    await expectNotInLive(context.database, records, recordForRestore.id);

    await adminA.get('/records/trash').expect(200).expect(({ body }: { body: RecordBody[] }) => {
      expect(body.some((row) => row.id === recordForRestore.id)).toBe(true);
    });

    await adminA.post(`/records/${recordForRestore.id}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'record', 'sample.record.restore', {
      schema: 'sample',
      rowId: recordForRestore.id,
    });
    await expectRestored(context.database, records, recordForRestore.id);
  });
});
