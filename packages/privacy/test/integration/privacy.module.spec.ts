import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { Database } from '@stynx/data';
import { createTestApp } from '@stynx/testing';
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
  jest.setTimeout(180_000);

  it('loads PII rules, exports live and archive rows, erases data, and reports retention', async () => {
    const appRoot = mkdtempSync(resolve(tmpdir(), 'stynx-privacy-fixture-'));
    mkdirSync(resolve(appRoot, 'app/privacy'), { recursive: true });
    writeFileSync(
      resolve(appRoot, 'app/privacy/pii-map.yaml'),
      [
        'rules:',
        '  - tableSchema: privacy_fixture',
        '    tableName: subjects',
        '    columnName: email',
        '    strategy: nullify',
        '    category: contact',
        '    subjectColumn: subject_user_id',
        '    tenantColumn: tenant_id',
        '  - tableSchema: privacy_fixture',
        '    tableName: subjects',
        '    columnName: phone',
        '    strategy: hash_with_salt',
        '    category: contact',
        '    subjectColumn: subject_user_id',
        '    tenantColumn: tenant_id',
        '  - tableSchema: privacy_fixture',
        '    tableName: subjects',
        '    columnName: note',
        '    strategy: tombstone',
        '    category: note',
        '    subjectColumn: subject_user_id',
        '    tenantColumn: tenant_id',
        '    retention:',
        '      timestampColumn: created_at',
        '      olderThanDays: 30',
        '      target: archive',
        '      reason: nightly fixture cleanup',
      ].join('\n'),
      'utf8',
    );

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
      migrations: [
        `
          create schema if not exists privacy_fixture;
          grant usage, create on schema privacy_fixture to stynx_owner;
          grant usage on schema privacy_fixture to stynx_app;
          grant usage on schema privacy_fixture to stynx_reader;
          select data.create_soft_deletable_table($$
            CREATE TABLE privacy_fixture.subjects (
              id uuid primary key,
              tenant_id uuid not null references tenancy.tenants(id),
              subject_user_id uuid not null,
              email text,
              phone text,
              note text,
              created_at timestamptz not null default clock_timestamp()
            )
          $$);
        `,
      ],
    });

    try {
      const piiMapService = testApp.moduleRef.get(PiiMapService);
      const privacyService = testApp.moduleRef.get(PrivacyService);
      const database = testApp.moduleRef.get(Database);
      const admin = await testApp.adminClient();
      try {
        await admin.query(
          `
            insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
            values ($1::uuid, 'privacy-fixture', 'Privacy Fixture', true, clock_timestamp(), clock_timestamp())
          `,
          [tenantId],
        );
        await admin.query(
          `
            insert into core.pii_map (table_schema, table_name, column_name, strategy, category, notes)
            values
              ('privacy_fixture', 'subjects', 'email', 'nullify', 'contact', 'fixture email'),
              ('privacy_fixture', 'subjects', 'phone', 'hash_with_salt', 'contact', 'fixture phone'),
              ('privacy_fixture', 'subjects', 'note', 'tombstone', 'note', 'fixture note')
          `,
        );
        await admin.query(
          `
            insert into privacy_fixture.subjects (id, tenant_id, subject_user_id, email, phone, note, created_at)
            values
              ('01978f4a-32bf-7c27-a131-fd73a9e10331', $1::uuid, $2::uuid, 'live@example.com', '5511999999999', 'keep me private', clock_timestamp())
          `,
          [tenantId, subjectUserId],
        );
        await admin.query(
          `
            insert into archive.privacy_fixture_subjects
              (id, tenant_id, subject_user_id, email, phone, note, created_at, archive_id, archived_at, deleted_at, deleted_by, last_erasure_at)
            values
              (
                '01978f4a-32bf-7c27-a131-fd73a9e10332',
                $1::uuid,
                $2::uuid,
                'old@example.com',
                '5511888888888',
                'old archive',
                clock_timestamp() - interval '60 days',
                1,
                clock_timestamp() - interval '60 days',
                clock_timestamp() - interval '60 days',
                '00000000-0000-0000-0000-000000000099',
                null
              )
          `,
          [tenantId, subjectUserId],
        );
      } finally {
        await admin.end();
      }

      await expect(piiMapService.load()).resolves.toHaveLength(3);

      const exportResult = await privacyService.exportData({
        subjectUserId,
        tenantId,
        format: 'json',
      });
      expect(exportResult.tables).toEqual([
        { table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 1 },
      ]);

      const zipBuffer = objectStore.objects.get(exportResult.objectKey);
      expect(zipBuffer).toBeDefined();
      const archive = await JSZip.loadAsync(zipBuffer as Buffer);
      const manifest = JSON.parse(await archive.file('manifest.json')!.async('string')) as {
        tables: Array<{ table: string; liveRows: number; archiveRows: number }>;
      };
      expect(manifest.tables[0]?.table).toBe('privacy_fixture.subjects');
      const liveExport = JSON.parse(
        await archive.file('tables/privacy_fixture.subjects_live.json')!.async('string'),
      ) as Array<Record<string, unknown>>;
      expect(liveExport[0]?.email).toBe('live@example.com');

      const erasureResult = await privacyService.eraseSubject({ subjectUserId });
      expect(erasureResult.actions).toHaveLength(3);
      expect(cognitoAdmin.disabledUsers).toEqual([subjectUserId]);

      const postErasure = await database.withSystemContext('privacy fixture verification', async () =>
        database.tx(
          async (trx) => {
            const live = await trx.query<{
              email: string | null;
              phone: string | null;
              note: string | null;
            }>(
              `
                select email, phone, note
                from privacy_fixture.subjects
                where subject_user_id = $1::uuid
              `,
              [subjectUserId],
            );
            const archived = await trx.query<{
              email: string | null;
              phone: string | null;
              note: string | null;
              last_erasure_at: string | null;
            }>(
              `
                select email, phone, note, last_erasure_at::text
                from archive.privacy_fixture_subjects
                where subject_user_id = $1::uuid
              `,
              [subjectUserId],
            );
            return {
              live: live.rows[0],
              archived: archived.rows[0],
            };
          },
          { role: 'owner', readonly: true, replica: false },
        ),
      );

      expect(postErasure.live?.email).toBeNull();
      expect(postErasure.live?.phone).toContain('hash:');
      expect(postErasure.live?.note).toBe(`[erased:${subjectUserId}]`);
      expect(postErasure.archived?.email).toBeNull();
      expect(postErasure.archived?.last_erasure_at).toBeTruthy();

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
  });
});
