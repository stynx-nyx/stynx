import JSZip from 'jszip';
import { expectRLSIsolated } from '@stynx-nyx/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRowsAsTenant } from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import {
  closeReferenceApiPrivacyE2e,
  setupReferenceApiPrivacyE2e,
  type ReferenceApiPrivacyE2eContext,
} from '../fixtures/privacy';
import { actors, tenants } from '../fixtures/seed';

interface PrivacyExportBody {
  exportId: string;
  objectKey: string;
  downloadUrl: string;
  expiresInSeconds: number;
  tables: Array<{ table: string; liveRows: number; archiveRows: number }>;
}

interface PrivacyErasureBody {
  subjectUserId: string;
  actions: Array<{
    table: string;
    column: string;
    strategy: string;
    liveAffected: number;
    archiveAffected: number;
  }>;
}

interface PrivacyRetentionBody {
  dryRun: boolean;
  actions: Array<{
    table: string;
    target: string;
    strategy: string;
    affectedRows: number;
    reason: string;
  }>;
}

interface PrivacySubjectRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  subject_user_id: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  profile_json: Record<string, unknown> | null;
}

interface PostErasureState {
  tenantALive: PrivacySubjectRow | undefined;
  tenantAArchived: (PrivacySubjectRow & { last_erasure_at: string | null }) | undefined;
  tenantBLive: PrivacySubjectRow | undefined;
  tenantAAttachments: number;
  tenantAArchivedAttachments: number;
  erasureAuditRows: Array<{ table_schema: string; table_name: string; operation: string }>;
  erasureEventCount: number;
}

async function loadExportArchive(context: ReferenceApiPrivacyE2eContext, objectKey: string): Promise<JSZip> {
  const zipBuffer = context.objectStore.objects.get(objectKey);
  expect(zipBuffer).toBeDefined();
  return JSZip.loadAsync(zipBuffer as Buffer);
}

async function readZipJson<T>(archive: JSZip, path: string): Promise<T> {
  const file = archive.file(path);
  expect(file).toBeDefined();
  return JSON.parse(await file!.async('string')) as T;
}

async function queryPostErasureState(context: ReferenceApiPrivacyE2eContext): Promise<PostErasureState> {
  return context.database.withSystemContext('privacy e2e erasure verification', async () =>
    context.database.tx(
      async (trx) => {
        const tenantALive = await trx.query<PrivacySubjectRow>(
          `
            select id::text, tenant_id::text, subject_user_id::text, email, phone, note, profile_json
            from privacy_fixture.subjects
            where subject_user_id = $1::uuid
          `,
          [context.subjects.tenantA.subjectUserId],
        );
        const tenantAArchived = await trx.query<PrivacySubjectRow & { last_erasure_at: string | null }>(
          `
            select id::text, tenant_id::text, subject_user_id::text, email, phone, note, profile_json, last_erasure_at::text
            from archive.privacy_fixture_subjects
            where subject_user_id = $1::uuid
          `,
          [context.subjects.tenantA.subjectUserId],
        );
        const tenantBLive = await trx.query<PrivacySubjectRow>(
          `
            select id::text, tenant_id::text, subject_user_id::text, email, phone, note, profile_json
            from privacy_fixture.subjects
            where subject_user_id = $1::uuid
          `,
          [context.subjects.tenantB.subjectUserId],
        );
        const tenantAAttachments = await trx.query<{ total: number }>(
          `
            select count(*)::int as total
            from privacy_fixture.attachments
            where subject_user_id = $1::uuid
          `,
          [context.subjects.tenantA.subjectUserId],
        );
        const tenantAArchivedAttachments = await trx.query<{ total: number }>(
          `
            select count(*)::int as total
            from archive.privacy_fixture_attachments
            where subject_user_id = $1::uuid
          `,
          [context.subjects.tenantA.subjectUserId],
        );
        const erasureAudit = await trx.query<{ table_schema: string; table_name: string; operation: string }>(
          `
            select table_schema, table_name, operation
            from audit.log
            where tags @> '{"lgpd_erasure": true}'::jsonb
            order by id
          `,
        );
        const erasureEvents = await trx.query<{ total: number }>(
          `
            select count(*)::int as total
            from audit.events
            where metadata @> '{"lgpd_erasure": true}'::jsonb
          `,
        );

        return {
          tenantALive: tenantALive.rows[0],
          tenantAArchived: tenantAArchived.rows[0],
          tenantBLive: tenantBLive.rows[0],
          tenantAAttachments: tenantAAttachments.rows[0]?.total ?? 0,
          tenantAArchivedAttachments: tenantAArchivedAttachments.rows[0]?.total ?? 0,
          erasureAuditRows: erasureAudit.rows,
          erasureEventCount: erasureEvents.rows[0]?.total ?? 0,
        };
      },
      { role: 'owner', readonly: true, replica: false },
    ),
  );
}

describe('@stynx-nyx/reference-api e2e privacy', () => {
  let context: ReferenceApiPrivacyE2eContext;
  let adminA: AuthenticatedAgent;

  beforeAll(async () => {
    context = await setupReferenceApiPrivacyE2e();
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiPrivacyE2e(context);
  });

  it('exports a subject bundle with live and archive privacy rows', async () => {
    const exported = (await adminA.post('/privacy/exports').send({
      subjectUserId: context.subjects.tenantA.subjectUserId,
      tenantId: tenants.tenantA,
      format: 'json',
    }).expect(201)).body as PrivacyExportBody;

    expect(exported).toEqual(expect.objectContaining({
      exportId: expect.any(String),
      objectKey: expect.stringMatching(/^exports\/.+\.zip$/u),
      downloadUrl: `memory://${exported.objectKey}?ttl=900`,
      expiresInSeconds: 900,
    }));
    expect(exported.tables).toEqual(expect.arrayContaining([
      { table: 'privacy_fixture.attachments', liveRows: 1, archiveRows: 1 },
      { table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 1 },
    ]));

    const archive = await loadExportArchive(context, exported.objectKey);
    const manifest = await readZipJson<{
      subjectUserId: string;
      tenantId: string;
      tables: PrivacyExportBody['tables'];
    }>(archive, 'manifest.json');
    const liveSubjects = await readZipJson<PrivacySubjectRow[]>(
      archive,
      'tables/privacy_fixture.subjects_live.json',
    );
    const liveAttachments = await readZipJson<Array<{ blob_key: string }>>(
      archive,
      'tables/privacy_fixture.attachments_live.json',
    );

    expect(manifest).toEqual(expect.objectContaining({
      subjectUserId: context.subjects.tenantA.subjectUserId,
      tenantId: tenants.tenantA,
    }));
    expect(liveSubjects).toHaveLength(1);
    expect(liveSubjects[0]).toEqual(expect.objectContaining({
      tenant_id: tenants.tenantA,
      subject_user_id: context.subjects.tenantA.subjectUserId,
      email: 'privacy-tenant-a-live@example.com',
    }));
    expect(JSON.stringify(liveSubjects)).not.toContain('privacy-tenant-b-live@example.com');
    expect(liveAttachments[0]?.blob_key).toBe(`s3://privacy/${tenants.tenantA}/live`);
  });

  it('rejects an export request without a subject or tenant selector', async () => {
    await adminA.post('/privacy/exports').send({ format: 'json' }).expect(400)
      .expect(({ body }) => {
        expect(body).toEqual(expect.objectContaining({
          code: 'PRIVACY_VALIDATION_ERROR',
          message: 'Export requires subjectUserId or tenantId',
        }));
      });
  });

  it('keeps tenant-filtered exports and direct RLS reads isolated', async () => {
    const crossTenant = (await adminA.post('/privacy/exports').send({
      subjectUserId: context.subjects.tenantA.subjectUserId,
      tenantId: tenants.tenantB,
      format: 'json',
    }).expect(201)).body as PrivacyExportBody;
    expect(crossTenant.tables).toEqual([]);

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<PrivacySubjectRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text, subject_user_id::text, email, phone, note, profile_json from privacy_fixture.subjects',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });

  it('reports retention candidates without deleting archive rows', async () => {
    const retention = (await adminA.get('/privacy/retention?dryRun=true').expect(200)).body as PrivacyRetentionBody;

    expect(retention.dryRun).toBe(true);
    expect(retention.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'archive.privacy_fixture_subjects',
        target: 'archive',
        strategy: 'tombstone',
        affectedRows: 2,
        reason: 'nightly fixture cleanup',
      }),
    ]));
  });

  it('erases a subject across live and archive stores and writes LGPD audit rows', async () => {
    const erased = (await adminA.post('/privacy/erasures').send({
      subjectUserId: context.subjects.tenantA.subjectUserId,
    }).expect(201)).body as PrivacyErasureBody;

    expect(erased.subjectUserId).toBe(context.subjects.tenantA.subjectUserId);
    expect(erased.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'privacy_fixture.attachments',
        column: 'blob_key',
        strategy: 'delete_row',
        liveAffected: 1,
        archiveAffected: 1,
      }),
      expect.objectContaining({
        table: 'privacy_fixture.subjects',
        column: 'email',
        strategy: 'nullify',
        liveAffected: 1,
        archiveAffected: 1,
      }),
      expect.objectContaining({
        table: 'privacy_fixture.subjects',
        column: 'phone',
        strategy: 'hash_with_salt',
        liveAffected: 1,
        archiveAffected: 1,
      }),
      expect.objectContaining({
        table: 'privacy_fixture.subjects',
        column: 'note',
        strategy: 'tombstone',
        liveAffected: 1,
        archiveAffected: 1,
      }),
    ]));
    expect(context.cognitoAdmin.disabledUsers).toEqual([context.subjects.tenantA.subjectUserId]);

    const state = await queryPostErasureState(context);
    expect(state.tenantALive).toEqual(expect.objectContaining({
      email: null,
      note: `[erased:${context.subjects.tenantA.subjectUserId}]`,
      profile_json: null,
    }));
    expect(state.tenantALive?.phone).toContain('hash:');
    expect(state.tenantAArchived).toEqual(expect.objectContaining({
      email: null,
      note: `[erased:${context.subjects.tenantA.subjectUserId}]`,
      profile_json: null,
    }));
    expect(state.tenantAArchived?.last_erasure_at).toBeTruthy();
    expect(state.tenantAAttachments).toBe(0);
    expect(state.tenantAArchivedAttachments).toBe(0);
    expect(state.tenantBLive).toEqual(expect.objectContaining({
      email: 'privacy-tenant-b-live@example.com',
      tenant_id: tenants.tenantB,
    }));
    expect(state.erasureAuditRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table_schema: 'privacy_fixture',
        table_name: 'subjects',
        operation: 'UPDATE',
      }),
      expect.objectContaining({
        table_schema: 'archive',
        table_name: 'privacy_fixture_subjects',
        operation: 'UPDATE',
      }),
      expect.objectContaining({
        table_schema: 'privacy_fixture',
        table_name: 'attachments',
        operation: 'DELETE',
      }),
      expect.objectContaining({
        table_schema: 'archive',
        table_name: 'privacy_fixture_attachments',
        operation: 'DELETE',
      }),
    ]));
    expect(state.erasureEventCount).toBeGreaterThanOrEqual(5);
  });
});
