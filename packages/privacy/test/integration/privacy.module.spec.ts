import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { Database } from '@stynx-nyx/data';
import {
  createTestApp,
  LGPD_FIXTURE_MIGRATIONS,
  lgpdFixturePiiMapYaml,
  seedLgpdFixture,
} from '@stynx-nyx/testing';
import { PiiMapService } from '../../src/pii-map.service';
import { PrivacyService } from '../../src/privacy.service';
import { StynxPrivacyModule } from '../../src/privacy.module';
import type { PrivacyCognitoAdmin, PrivacyObjectStore } from '../../src/types';

class InMemoryPrivacyObjectStore implements PrivacyObjectStore {
  readonly objects = new Map<string, Buffer>();

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    expiresAt?: Date;
  }): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string> {
    return `memory://${input.key}?ttl=${input.expiresInSeconds}`;
  }
}

class CapturingCognitoAdmin implements PrivacyCognitoAdmin {
  readonly disabledUsers: string[] = [];

  async disableUser(subjectUserId: string): Promise<void> {
    this.disabledUsers.push(subjectUserId);
  }
}

describe('StynxPrivacyModule integration', () => {

  it('loads PII rules, exports live and archive rows, erases data, and reports retention', async () => {
    const appRoot = mkdtempSync(resolve(tmpdir(), 'stynx-privacy-fixture-'));
    mkdirSync(resolve(appRoot, 'app/privacy'), { recursive: true });
    writeFileSync(resolve(appRoot, 'app/privacy/pii-map.yaml'), lgpdFixturePiiMapYaml(), 'utf8');

    const objectStore = new InMemoryPrivacyObjectStore();
    const cognitoAdmin = new CapturingCognitoAdmin();
    const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e10111';
    const subjectUserId = '01978f4a-32bf-7c27-a131-fd73a9e10222';

    const testApp = await createTestApp({
      overrides: {
        imports: [
          StynxPrivacyModule.forRoot({
            appRoot,
            environment: 'test',
            region: 'us-east-1',
            erasureSalt: 'privacy-fixture-salt',
            objectStore,
            cognitoAdmin,
          }),
        ],
      },
      migrations: LGPD_FIXTURE_MIGRATIONS,
    });

    try {
      const piiMapService = testApp.moduleRef.get(PiiMapService);
      const privacyService = testApp.moduleRef.get(PrivacyService);
      const database = testApp.moduleRef.get(Database);
      const admin = await testApp.adminClient();
      let ids;
      try {
        ids = await seedLgpdFixture(admin, { tenantId, subjectUserId });
      } finally {
        await admin.end();
      }

      await expect(piiMapService.load()).resolves.toHaveLength(5);

      const exportResult = await privacyService.exportData({
        subjectUserId,
        tenantId,
        format: 'json',
      });
      expect(exportResult.tables).toEqual(
        expect.arrayContaining([
          { table: 'privacy_fixture.attachments', liveRows: 1, archiveRows: 1 },
          { table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 1 },
        ]),
      );

      const zipBuffer = objectStore.objects.get(exportResult.objectKey);
      expect(zipBuffer).toEqual(expect.anything());
      const archive = await JSZip.loadAsync(zipBuffer as Buffer);
      const manifest = JSON.parse(await archive.file('manifest.json')!.async('string')) as {
        tables: Array<{ table: string; liveRows: number; archiveRows: number }>;
      };
      expect(manifest.tables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'privacy_fixture.subjects' }),
          expect.objectContaining({ table: 'privacy_fixture.attachments' }),
        ]),
      );
      const liveExport = JSON.parse(
        await archive.file('tables/privacy_fixture.subjects_live.json')!.async('string'),
      ) as Array<Record<string, unknown>>;
      expect(liveExport[0]?.email).toBe('live@example.com');
      const attachmentExport = JSON.parse(
        await archive.file('tables/privacy_fixture.attachments_live.json')!.async('string'),
      ) as Array<Record<string, unknown>>;
      expect(attachmentExport[0]?.blob_key).toBe('s3://fixture/live');

      const erasureResult = await privacyService.eraseSubject({ subjectUserId });
      expect(erasureResult.actions).toEqual(
        expect.arrayContaining([
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
            column: 'profile_json',
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
        ]),
      );
      expect(cognitoAdmin.disabledUsers).toEqual([subjectUserId]);

      const postErasure = await database.withSystemContext(
        'privacy fixture verification',
        async () =>
          database.tx(
            async (trx) => {
              const live = await trx.query<{
                email: string | null;
                phone: string | null;
                note: string | null;
                profile_json: string | null;
              }>(
                `
                select email, phone, note, profile_json::text
                from privacy_fixture.subjects
                where subject_user_id = $1::uuid
              `,
                [subjectUserId],
              );
              const archived = await trx.query<{
                email: string | null;
                phone: string | null;
                note: string | null;
                profile_json: string | null;
                last_erasure_at: string | null;
              }>(
                `
                select email, phone, note, profile_json::text, last_erasure_at::text
                from archive.privacy_fixture_subjects
                where subject_user_id = $1::uuid
              `,
                [subjectUserId],
              );
              const attachments = await trx.query<{ total: number }>(
                `
                select count(*)::int as total
                from privacy_fixture.attachments
                where subject_user_id = $1::uuid
              `,
                [subjectUserId],
              );
              const archivedAttachments = await trx.query<{ total: number }>(
                `
                select count(*)::int as total
                from archive.privacy_fixture_attachments
                where subject_user_id = $1::uuid
              `,
                [subjectUserId],
              );
              const erasureAudit = await trx.query<{
                table_schema: string;
                table_name: string;
                operation: string;
                tags: Record<string, unknown>;
              }>(
                `
                select table_schema, table_name, operation, tags
                from audit.log
                where tags @> '{"lgpd_erasure": true}'::jsonb
                order by id
              `,
              );
              const erasureEvents = await trx.query<{
                total: number;
                hashed: boolean;
              }>(
                `
                select count(*)::int as total,
                       coalesce(bool_and(row_hash is not null), true) as hashed
                from audit.events
                where metadata @> '{"lgpd_erasure": true}'::jsonb
              `,
              );
              return {
                live: live.rows[0],
                archived: archived.rows[0],
                attachmentCount: attachments.rows[0]?.total,
                archivedAttachmentCount: archivedAttachments.rows[0]?.total,
                erasureAudit: erasureAudit.rows,
                erasureEvents: erasureEvents.rows[0],
              };
            },
            { role: 'owner', readonly: true, replica: false },
          ),
      );

      expect(postErasure.live?.email).toBe(null);
      expect(postErasure.live?.phone).toContain('hash:');
      expect(postErasure.live?.note).toBe(`[erased:${subjectUserId}]`);
      expect(postErasure.live?.profile_json).toBe(null);
      expect(postErasure.archived?.email).toBe(null);
      expect(postErasure.archived?.note).toBe(`[erased:${subjectUserId}]`);
      expect(postErasure.archived?.profile_json).toBe(null);
      expect(postErasure.archived?.last_erasure_at).toEqual(expect.anything());
      expect(postErasure.attachmentCount).toBe(0);
      expect(postErasure.archivedAttachmentCount).toBe(0);
      expect(postErasure.erasureAudit).toEqual(
        expect.arrayContaining([
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
        ]),
      );
      expect(postErasure.erasureAudit.every((row) => row.tags.lgpd_erasure === true)).toBe(true);
      expect(postErasure.erasureEvents).toEqual({ total: 10, hashed: true });
      expect(ids).toEqual(expect.anything());

      const retentionDryRun = await privacyService.applyRetention(true);
      expect(retentionDryRun.actions).toEqual([
        expect.objectContaining({
          table: 'archive.privacy_fixture_subjects',
          target: 'archive',
          strategy: 'tombstone',
        }),
      ]);
    } finally {
      await testApp.teardown();
    }
  }, 60_000);
});
