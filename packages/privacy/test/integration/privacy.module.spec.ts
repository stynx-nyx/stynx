import { ForbiddenException } from '@nestjs/common';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { StynxAuthModule } from '@stynx-nyx/auth';
import { Database } from '@stynx-nyx/data';
import {
  createTestApp,
  LGPD_FIXTURE_MIGRATIONS,
  lgpdFixturePiiMapYaml,
  seedLgpdFixture,
} from '@stynx-nyx/testing';
import { PiiMapService } from '../../src/pii-map.service.js';
import { PrivacyService } from '../../src/privacy.service.js';
import { StynxPrivacyModule } from '../../src/privacy.module.js';
import type { PrivacyCognitoAdmin, PrivacyObjectStore } from '../../src/types.js';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import {
  AuthenticatedPrivacyApp,
  PrivacyBoundaryController,
  TENANT,
  OTHER_TENANT,
  ACTOR,
  SUBJECT,
  FOREIGN_SUBJECT,
  INACTIVE_SUBJECT,
  SALT,
} from '../support/authenticated-privacy-app.js';

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
  // Timeout raised from 60s: the full `pnpm test` run executes every
  // package's suite concurrently (turbo) against one shared Postgres, and
  // this test pays fresh-database + full platform-migration setup under
  // that contention (observed timeouts at ~60s in concurrent runs while
  // completing in ~20s when run alone). The test itself is correct and
  // fast; the budget covers cold Postgres under CPU contention — same
  // rationale as the cascade-archive test in packages/data (07ceaf01a).
  it(
    'loads PII rules, exports live and archive rows, erases data, and reports retention',
    { timeout: 120_000 },
    async () => {
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
            StynxAuthModule.forRoot({ stynx: { issuer: 'https://privacy-internal-fixture.test' } }),
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

        await expect(
          database.withSystemContext('explicit privacy integration rules', () =>
            piiMapService.load(),
          ),
        ).resolves.toHaveLength(5);

        const exportResult = await database.withSystemContext(
          'explicit privacy integration export',
          () =>
            privacyService.exportData({
              subjectUserId,
              tenantId,
              format: 'json',
            }),
        );
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

        const erasureResult = await database.withSystemContext(
          'explicit privacy integration erasure',
          () => privacyService.eraseSubject({ subjectUserId }),
        );
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

        const retentionDryRun = await database.withSystemContext(
          'explicit privacy integration report',
          () => privacyService.applyRetention(true),
        );
        expect(retentionDryRun.actions).toEqual([
          expect.objectContaining({
            table: 'archive.privacy_fixture_subjects',
            target: 'archive',
            strategy: 'tombstone',
          }),
        ]);
        // A freshly migrated database has only the current and next session months.
        expect(retentionDryRun.partitions).toEqual([]);
      } finally {
        await testApp.teardown();
        rmSync(appRoot, { recursive: true, force: true });
      }
    },
  );
});

describe('Privacy tenant HTTP security and custody', () => {
  let fixture: AuthenticatedPrivacyApp;
  beforeAll(async () => {
    fixture = new AuthenticatedPrivacyApp();
    await fixture.initialize();
  }, 60_000);
  afterAll(async () => {
    await fixture?.teardown();
  });
  beforeEach(async () => {
    await fixture.resetRows();
    fixture.resetObservations();
    fixture.objectStore.failure = undefined;
    fixture.objectStore.afterPut = undefined;
    fixture.objectStore.afterPresign = undefined;
    fixture.afterBusinessQuery = undefined;
    fixture.afterSnapshotCommit = undefined;
    fixture.writeRules();
  });
  const server = () => fixture.app.getHttpServer();
  const exportBody = { subjectUserId: SUBJECT, format: 'json' };

  it('uses actual direct restricted reader/app sessions with FORCE RLS and two populated tenants', async () => {
    expect(await fixture.poolIdentities()).toEqual([
      {
        current_user: 'stynx_app',
        session_user: 'stynx_app',
        rolsuper: false,
        rolbypassrls: false,
      },
      {
        current_user: 'stynx_reader',
        session_user: 'stynx_reader',
        rolsuper: false,
        rolbypassrls: false,
      },
    ]);
    const admin = await fixture.adminClient();
    try {
      expect(
        (await admin.query("select row_security_active('privacy_http.subjects') filtered")).rows,
      ).toEqual([{ filtered: false }]);
      expect(
        (
          await admin.query(
            "select relrowsecurity,relforcerowsecurity from pg_class where oid='privacy_http.subjects'::regclass",
          )
        ).rows,
      ).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
      expect(
        (
          await admin.query(
            'select distinct tenant_id from privacy_http.subjects order by tenant_id',
          )
        ).rows.map((row) => row.tenant_id),
      ).toEqual([TENANT, OTHER_TENANT]);
    } finally {
      await admin.end();
    }
  });
  it('authenticates before tenant processing and denies missing permission or foreign membership', async () => {
    await request(server()).get('/privacy/retention').expect(401);
    await request(server()).get('/privacy/retention').set(fixture.headers('denied')).expect(403);
    await request(server())
      .get('/privacy/retention')
      .set(fixture.headers('other', OTHER_TENANT))
      .expect(403);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(
      fixture.observations.some(
        (row) =>
          row.requestedRole === 'owner' ||
          row.current_user === 'stynx_owner' ||
          !['stynx_app', 'stynx_reader'].includes(String(row.session_user)),
      ),
    ).toBe(false);
  });
  it('refuses unsigned, genuinely expired and revoked-session credentials before privacy SQL', async () => {
    await fixture.createRevokedSession();
    for (const token of [
      'invalid.unsigned.token',
      fixture.token('writer', { exp: Math.floor(Date.now() / 1000) - 3600 }),
      fixture.token('writer', { sid: 'revoked' }),
    ])
      await request(server())
        .get('/privacy/retention')
        .set({ authorization: `Bearer ${token}`, 'x-tenant-id': TENANT })
        .expect(401);
    expect(
      fixture.queries.filter(
        (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
      ),
    ).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(
      fixture.observations.some(
        (row) =>
          row.requestedRole === 'owner' ||
          row.current_user === 'stynx_owner' ||
          !['stynx_app', 'stynx_reader'].includes(String(row.session_user)),
      ),
    ).toBe(false);
  });
  it('conditionally requires subject rights for retention effects and strictly validates query fields', async () => {
    const before = await fixture.snapshot();
    await request(server())
      .get('/privacy/retention?dryRun=false')
      .set(fixture.headers('reader'))
      .expect(403);
    for (const query of ['dryRun=FALSE', 'dryRun=1', 'dryRun=true&dryRun=false', 'unexpected=true'])
      await request(server()).get(`/privacy/retention?${query}`).set(fixture.headers()).expect(400);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('rejects a nonboolean direct retention argument after real admission and before privacy SQL', async () => {
    const before = await fixture.snapshot();
    const response = await request(server())
      .get('/_privacy-test/retention-invalid-input')
      .set(fixture.headers('reader'))
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'PRIVACY_VALIDATION_ERROR',
      message: 'dryRun must be a boolean',
    });
    expect(
      fixture.queries.filter(
        (row) =>
          row.sql.includes('core.pii_map') ||
          row.sql.includes('privacy_http') ||
          row.sql.includes('drop_expired_sessions_partitions'),
      ),
    ).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(fixture.disabledUsers).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('exports an explicitly matching tenant selector using the admitted restricted reader', async () => {
    const before = await fixture.snapshot();
    const response = await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send({ ...exportBody, tenantId: TENANT })
      .expect(201);
    const archive = await JSZip.loadAsync(
      fixture.objectStore.objects.get(response.body.objectKey)!,
    );
    const manifest = JSON.parse(await archive.file('manifest.json')!.async('string'));
    expect(manifest.tenantId).toBe(TENANT);
    expect(response.body.objectKey).toMatch(new RegExp(`^exports/${TENANT}/`));
    expect(response.body.tables.map((row: { table: string }) => row.table)).toEqual([
      'privacy_http.attachments',
      'privacy_http.subjects',
    ]);
    expect(
      fixture.observations.some(
        (row) => row.requestedRole === 'owner' || row.current_user === 'stynx_owner',
      ),
    ).toBe(false);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('refuses nominal HTTP, nested SystemContext, CLS reset and mismatched current frame before business SQL', async () => {
    const before = await fixture.snapshot();
    await request(server()).get('/_privacy-test/nominal').expect(403);
    await request(server()).get('/_privacy-test/optional').expect(403);
    for (const path of ['system', 'reset-system']) {
      const response = await request(server())
        .get(`/_privacy-test/${path}`)
        .set(fixture.headers('reader'))
        .expect(403);
      expect(response.body.message).toBe(
        'Global privacy administration is unavailable to HTTP requests',
      );
    }
    await request(server())
      .get('/_privacy-test/context-mismatch')
      .set(fixture.headers('reader'))
      .expect(403);
    expect(
      fixture.queries.filter(
        (row) => row.sql.includes('privacy_http') || row.sql.includes('core.pii_map'),
      ),
    ).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('admits optional verified auth through the actual tenancy proof while retaining reader role', async () => {
    const response = await request(server())
      .get('/_privacy-test/optional')
      .set(fixture.headers('reader'))
      .expect(200);
    expect(response.body).toMatchObject({ dryRun: true, partitions: [] });
    expect(fixture.observations.length).toBeGreaterThan(0);
    expect(
      fixture.observations.every(
        (row) =>
          row.current_user === 'stynx_reader' &&
          row.session_user === 'stynx_reader' &&
          row.tenant === TENANT &&
          row.readonly === 'on',
      ),
    ).toBe(true);
  });
  it('refuses held and CLS-hidden connections without changing data or starting privacy SQL/providers', async () => {
    const before = await fixture.snapshot();
    for (const path of ['held', 'hidden']) {
      const response = await request(server())
        .get(`/_privacy-test/${path}`)
        .set(fixture.headers('reader'))
        .expect(409);
      expect(response.body.code).toBe('INDEPENDENT_TRANSACTION_CONNECTION');
    }
    expect(
      fixture.queries.filter(
        (row) => row.sql.includes('privacy_http') || row.sql.includes('core.pii_map'),
      ),
    ).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.objectStore.calls).toEqual([]);
  });
  it('refuses missing selectors, malformed closed bodies and supplied tenant mismatch before export SQL/providers', async () => {
    for (const body of [
      { format: 'json' },
      { ...exportBody, extra: true },
      { ...exportBody, format: 'xml' },
      { ...exportBody, subjectUserId: 'not-uuid' },
    ])
      await request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send(body)
        .expect(400);
    const result = await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send({ ...exportBody, tenantId: OTHER_TENANT })
      .expect(403);
    expect(result.body.message).toBe('Export tenant differs from the admitted tenant');
    expect(fixture.objectStore.calls).toEqual([]);
    expect(fixture.queries.some((row) => row.sql.includes('privacy_http'))).toBe(false);
  });
  it('rejects foreign and inactive subjects with no data effects or export delivery', async () => {
    const before = await fixture.snapshot();
    for (const subjectUserId of [FOREIGN_SUBJECT, INACTIVE_SUBJECT]) {
      await request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send({ subjectUserId, format: 'json' })
        .expect(403);
      await request(server())
        .post('/privacy/erasures')
        .set(fixture.headers())
        .send({ subjectUserId })
        .expect(403);
    }
    expect(await fixture.snapshot()).toEqual(before);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(fixture.disabledUsers).toEqual([]);
  });
  it('exports only admitted tenant live/archive rows with lossless JSON, safe CSV, exact manifest and no owner SQL', async () => {
    const before = await fixture.snapshot();
    const response = await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send(exportBody)
      .expect(201);
    expect(response.body.objectKey).toMatch(new RegExp(`^exports/${TENANT}/[^/]+\\.zip$`));
    const zip = await JSZip.loadAsync(fixture.objectStore.objects.get(response.body.objectKey)!);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({
      tenantId: TENANT,
      subjectUserId: SUBJECT,
      representations: { json: 'lossless', csv: 'spreadsheet-safe strings' },
    });
    expect(manifest.tables.map((table: { table: string }) => table.table)).toEqual([
      'privacy_http.attachments',
      'privacy_http.subjects',
    ]);
    for (const suffix of ['live', 'archive']) {
      const rows = JSON.parse(
        await zip.file(`tables/privacy_http.subjects_${suffix}.json`)!.async('string'),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: TENANT,
        user_id: SUBJECT,
        note: ' \u0085=HYPERLINK("bad")',
        amount: -42,
        '=column': '=1',
      });
      const csv = await zip.file(`tables/privacy_http.subjects_${suffix}.csv`)!.async('string');
      expect(csv).toContain("' \u0085=HYPERLINK");
      expect(csv).toContain(',-42,');
      expect(csv.split('\n')[0]).toContain("'=column");
      expect(csv).toContain("'=1");
      expect(csv).not.toContain(OTHER_TENANT);
    }
    expect(
      Object.keys(zip.files).some(
        (name) => name.includes('global_records') || name.includes('auth.users'),
      ),
    ).toBe(false);
    expect(fixture.objectStore.calls).toEqual(['put', 'presign']);
    expect(
      fixture.observations.every(
        (row) =>
          row.current_user === 'stynx_reader' &&
          row.session_user === 'stynx_reader' &&
          row.readonly === 'on' &&
          row.tenant === TENANT &&
          row.actor === ACTOR,
      ),
    ).toBe(true);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('refuses conflicting table scope metadata and propagates object put/presign failures without completing an export', async () => {
    const before = await fixture.snapshot();
    fixture.writeRules(
      fixture.rules.map((rule) =>
        rule.columnName === 'phone' ? { ...rule, tenantColumn: 'wrong_tenant' } : rule,
      ),
    );
    await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send(exportBody)
      .expect(500);
    expect(fixture.objectStore.calls).toEqual([]);
    fixture.writeRules();
    for (const phase of ['put', 'presign'] as const) {
      fixture.objectStore.failure = phase;
      fixture.objectStore.calls.length = 0;
      await request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send(exportBody)
        .expect(500);
      expect(fixture.objectStore.calls).toEqual(phase === 'put' ? ['put'] : ['put', 'presign']);
    }
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('does not turn a trusted private tenant frame into HTTP command admission', async () => {
    await expect(
      fixture.runPrivateFrame(() => fixture.privacy.applyTenantRetention(true)),
    ).rejects.toThrow('Privacy requires verified tenant admission');
    expect(fixture.queries).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
  });
  it('refuses global internal administration inside an actual owner transaction before provider work', async () => {
    const before = await fixture.snapshot();
    await expect(
      fixture.runInternal(() =>
        fixture.database.tx(() => fixture.privacy.eraseSubject({ subjectUserId: SUBJECT }), {
          role: 'owner',
          retry: false,
        }),
      ),
    ).rejects.toMatchObject({ code: 'INDEPENDENT_TRANSACTION_CONNECTION' });
    expect(
      fixture.queries.some(
        (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
      ),
    ).toBe(false);
    expect(fixture.disabledUsers).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('keeps simultaneous authenticated exports scoped to their separate tenants and actors', async () => {
    const responses = await Promise.all([
      request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send(exportBody)
        .expect(201),
      request(server())
        .post('/privacy/exports')
        .set(fixture.headers('otherWriter', OTHER_TENANT))
        .send(exportBody)
        .expect(201),
    ]);
    for (const [index, tenant] of [TENANT, OTHER_TENANT].entries()) {
      const zip = await JSZip.loadAsync(
        fixture.objectStore.objects.get(responses[index].body.objectKey)!,
      );
      const rows = JSON.parse(
        await zip.file('tables/privacy_http.subjects_live.json')!.async('string'),
      );
      expect(rows.map((row: { tenant_id: string }) => row.tenant_id)).toEqual([tenant]);
      expect(responses[index].body.objectKey).toContain(`exports/${tenant}/`);
    }
    expect(
      fixture.observations.some(
        (row) =>
          row.requestedRole === 'owner' ||
          row.current_user === 'stynx_owner' ||
          !['stynx_app', 'stynx_reader'].includes(String(row.session_user)),
      ),
    ).toBe(false);
  });
  // White-box stale captured arguments; live HTTP proof/CLS stay valid throughout.
  it.each(['tenant', 'actor'] as const)(
    'refuses stale captured export %s independently of live proof admission',
    async (fault) => {
      const before = await fixture.snapshot();
      const boundary = fixture.moduleRef.get(PrivacyBoundaryController);
      boundary.capturedAuthorityFailures.length = 0;
      boundary.capturedTransactionCallbacks = 0;
      const response = await request(server())
        .get(`/_privacy-test/captured-export-authority/${fault}`)
        .set(fixture.headers())
        .expect(403);
      expect(response.body.message).toBe('Privacy export context changed');
      expect(boundary.capturedAuthorityFailures).toHaveLength(1);
      expect(boundary.capturedAuthorityFailures[0]).toBeInstanceOf(ForbiddenException);
      expect((boundary.capturedAuthorityFailures[0] as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'Privacy export context changed',
        error: 'Forbidden',
      });
      expect(boundary.capturedTransactionCallbacks).toBe(0);
      expect(
        fixture.queries.filter(
          (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
        ),
      ).toEqual([]);
      expect(fixture.objectStore.calls).toEqual([]);
      expect(fixture.disabledUsers).toEqual([]);
      expect(await fixture.snapshot()).toEqual(before);
    },
  );
  it('accepts the actual current captured export pair without SQL or provider effects', async () => {
    const before = await fixture.snapshot();
    const boundary = fixture.moduleRef.get(PrivacyBoundaryController);
    boundary.capturedAuthorityFailures.length = 0;
    boundary.capturedTransactionCallbacks = 0;
    const response = await request(server())
      .get('/_privacy-test/captured-export-authority/valid')
      .set(fixture.headers())
      .expect(200);
    expect(response.body).toEqual({ tenantId: TENANT, actorId: ACTOR });
    expect(boundary.capturedAuthorityFailures).toEqual([]);
    expect(boundary.capturedTransactionCallbacks).toBe(0);
    expect(
      fixture.queries.filter(
        (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
      ),
    ).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(fixture.disabledUsers).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it.each(['tenant', 'actor'] as const)(
    'refuses stale captured transaction %s without invoking its callback',
    async (fault) => {
      const before = await fixture.snapshot();
      const boundary = fixture.moduleRef.get(PrivacyBoundaryController);
      boundary.capturedAuthorityFailures.length = 0;
      boundary.capturedTransactionCallbacks = 0;
      const response = await request(server())
        .get(`/_privacy-test/captured-transaction-authority/${fault}`)
        .set(fixture.headers())
        .expect(403);
      expect(response.body.message).toBe('Privacy tenant context changed');
      expect(boundary.capturedAuthorityFailures).toHaveLength(1);
      expect(boundary.capturedAuthorityFailures[0]).toBeInstanceOf(ForbiddenException);
      expect((boundary.capturedAuthorityFailures[0] as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'Privacy tenant context changed',
        error: 'Forbidden',
      });
      expect(boundary.capturedTransactionCallbacks).toBe(0);
      expect(
        fixture.queries.filter(
          (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
        ),
      ).toEqual([]);
      expect(fixture.objectStore.calls).toEqual([]);
      expect(fixture.disabledUsers).toEqual([]);
      expect(await fixture.snapshot()).toEqual(before);
    },
  );
  it('executes the current captured transaction pair exactly once using the real restricted reader', async () => {
    const before = await fixture.snapshot();
    const boundary = fixture.moduleRef.get(PrivacyBoundaryController);
    boundary.capturedAuthorityFailures.length = 0;
    boundary.capturedTransactionCallbacks = 0;
    const response = await request(server())
      .get('/_privacy-test/captured-transaction-authority/valid')
      .set(fixture.headers())
      .expect(200);
    expect(response.body).toEqual({
      current_user: 'stynx_reader',
      session_user: 'stynx_reader',
      tenant: TENANT,
      actor: ACTOR,
      readonly: 'on',
    });
    expect(boundary.capturedTransactionCallbacks).toBe(1);
    expect(boundary.capturedAuthorityFailures).toEqual([]);
    expect(
      fixture.queries.filter(
        (row) => row.sql.includes('core.pii_map') || row.sql.includes('privacy_http'),
      ),
    ).toEqual([]);
    expect(fixture.objectStore.calls).toEqual([]);
    expect(fixture.disabledUsers).toEqual([]);
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('refuses delivery if the active tenant changes after the actual SQL snapshot commits', async () => {
    const before = await fixture.snapshot();
    let committedSnapshots = 0;
    fixture.afterSnapshotCommit = () => {
      committedSnapshots++;
      fixture.mutateContext();
    };
    const response = await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send(exportBody);
    expect({
      status: response.status,
      committedSnapshots,
      providerCalls: [...fixture.objectStore.calls],
    }).toEqual({ status: 403, committedSnapshots: 1, providerCalls: [] });
    expect(await fixture.snapshot()).toEqual(before);
  });
  it('refuses delivery if the actual actor changes after snapshot commit', async () => {
    fixture.afterSnapshotCommit = () => fixture.mutateContext({ actorId: FOREIGN_SUBJECT });
    await request(server())
      .post('/privacy/exports')
      .set(fixture.headers())
      .send(exportBody)
      .expect(403);
    expect(fixture.objectStore.calls).toEqual([]);
  });
  it('revalidates admission after real ZIP generation before object upload', async () => {
    const original = JSZip.prototype.generateAsync;
    const observer = vi.spyOn(JSZip.prototype, 'generateAsync').mockImplementation(async function (
      this: JSZip,
      ...args: Parameters<typeof original>
    ) {
      const body = await original.apply(this, args);
      fixture.mutateContext({ actorId: FOREIGN_SUBJECT });
      return body;
    });
    try {
      await request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send(exportBody)
        .expect(403);
      expect(fixture.objectStore.calls).toEqual([]);
    } finally {
      observer.mockRestore();
    }
  });
  it.each(['put', 'presign'] as const)(
    'refuses a completed result when context changes during awaited external %s',
    async (phase) => {
      const before = await fixture.snapshot();
      const mutate = async () => {
        await Promise.resolve();
        fixture.mutateContext({ actorId: FOREIGN_SUBJECT });
      };
      if (phase === 'put') fixture.objectStore.afterPut = mutate;
      else fixture.objectStore.afterPresign = mutate;
      const response = await request(server())
        .post('/privacy/exports')
        .set(fixture.headers())
        .send(exportBody)
        .expect(403);
      expect(response.body).not.toHaveProperty('downloadUrl');
      expect(fixture.objectStore.calls).toEqual(phase === 'put' ? ['put'] : ['put', 'presign']);
      expect(await fixture.snapshot()).toEqual(before);
    },
  );
  it('rolls back all tenant erasure mutations on a real later SQL constraint refusal', async () => {
    const admin = await fixture.adminClient();
    await admin.query(
      'alter table archive.privacy_http_subjects add constraint privacy_keep_email check(email is not null)',
    );
    const before = await fixture.snapshot();
    try {
      await request(server())
        .post('/privacy/erasures')
        .set(fixture.headers())
        .send({ subjectUserId: SUBJECT })
        .expect(500);
      expect(
        fixture.queries.some(
          (row) => row.sql.startsWith('delete from') && row.sql.includes('attachments'),
        ),
      ).toBe(true);
      expect(await fixture.snapshot()).toEqual(before);
      expect(fixture.disabledUsers).toEqual([]);
      expect(fixture.objectStore.calls).toEqual([]);
    } finally {
      await admin.query(
        'alter table archive.privacy_http_subjects drop constraint privacy_keep_email',
      );
      await admin.end();
    }
  });
  it('erases only admitted tenant live/archive subject rows with versioned HMAC and never disables global identity', async () => {
    const before = await fixture.snapshot();
    const response = await request(server())
      .post('/privacy/erasures')
      .set(fixture.headers())
      .send({ subjectUserId: SUBJECT })
      .expect(201);
    expect(response.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategy: 'hash_with_salt',
          liveAffected: 1,
          archiveAffected: 1,
        }),
        expect.objectContaining({ strategy: 'delete_row', liveAffected: 1, archiveAffected: 1 }),
      ]),
    );
    const after = await fixture.snapshot();
    const expectedHash =
      'hash:' +
      createHmac('sha256', SALT)
        .update(
          JSON.stringify([
            'stynx-privacy-pseudonym-v1',
            'privacy_http',
            'subjects',
            'phone',
            SUBJECT,
            TENANT,
          ]),
        )
        .digest('hex');
    for (const table of ['privacy_http.subjects', 'archive.privacy_http_subjects']) {
      const rows = (after[table] as { value: Record<string, unknown> }[]).map((row) => row.value);
      expect(rows.find((row) => row.tenant_id === TENANT)).toMatchObject({
        email: null,
        phone: expectedHash,
        note: `[erased:${SUBJECT}]`,
      });
      expect(rows.find((row) => row.tenant_id === OTHER_TENANT)).toEqual(
        (before[table] as { value: Record<string, unknown> }[]).find(
          (row) => row.value.tenant_id === OTHER_TENANT,
        )?.value,
      );
    }
    expect(after['auth.users']).toEqual(before['auth.users']);
    expect(after['auth.memberships']).toEqual(before['auth.memberships']);
    expect(after['privacy_http.global_records']).toEqual(before['privacy_http.global_records']);
    expect(after['archive.privacy_http_global_records']).toEqual(
      before['archive.privacy_http_global_records'],
    );
    expect(fixture.disabledUsers).toEqual([]);
    expect(
      fixture.observations
        .filter((row) => row.requestedRole === 'app')
        .every(
          (row) =>
            row.current_user === 'stynx_app' &&
            row.session_user === 'stynx_app' &&
            row.tenant === TENANT &&
            row.actor === ACTOR &&
            row.readonly === 'off',
        ),
    ).toBe(true);
    expect(
      fixture.observations.some(
        (row) =>
          row.requestedRole === 'owner' ||
          row.current_user === 'stynx_owner' ||
          !['stynx_app', 'stynx_reader'].includes(String(row.session_user)),
      ),
    ).toBe(false);
  });
  it('runs tenant retention effects with empty partition result and leaves the other tenant untouched', async () => {
    const before = await fixture.snapshot();
    const response = await request(server())
      .get('/privacy/retention?dryRun=false')
      .set(fixture.headers('otherWriter', OTHER_TENANT))
      .expect(200);
    expect(response.body).toMatchObject({ dryRun: false, partitions: [] });
    expect(response.body.actions).toHaveLength(2);
    expect(
      fixture.queries.some((row) => row.sql.includes('drop_expired_sessions_partitions')),
    ).toBe(false);
    const after = await fixture.snapshot();
    for (const table of ['privacy_http.attachments', 'archive.privacy_http_attachments']) {
      expect(
        (after[table] as { value: { tenant_id: string } }[]).map((row) => row.value.tenant_id),
      ).toEqual([TENANT]);
      expect(before[table] as unknown[]).toHaveLength(2);
      expect(after[table]).toEqual(
        (before[table] as { value: { tenant_id: string } }[]).filter(
          (row) => row.value.tenant_id === TENANT,
        ),
      );
    }
    expect(after['auth.users']).toEqual(before['auth.users']);
    expect(fixture.disabledUsers).toEqual([]);
  });
});
