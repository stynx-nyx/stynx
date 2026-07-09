import { lgpdFixturePiiMapYaml, seedLgpdFixture } from '../src/lgpd-fixture';
import type { StynxPgClient } from '@stynx-nyx/data';

describe('LGPD fixture helpers', () => {
  it('emits a PII map with every fixture strategy', () => {
    const yaml = lgpdFixturePiiMapYaml();

    expect(yaml).toBe([
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
      '  - tableSchema: privacy_fixture',
      '    tableName: subjects',
      '    columnName: profile_json',
      '    strategy: nullify',
      '    category: profile',
      '    subjectColumn: subject_user_id',
      '    tenantColumn: tenant_id',
      '  - tableSchema: privacy_fixture',
      '    tableName: attachments',
      '    columnName: blob_key',
      '    strategy: delete_row',
      '    category: storage',
      '    subjectColumn: subject_user_id',
      '    tenantColumn: tenant_id',
    ].join('\n'));
  });

  it('seeds generated ids and preserves caller-provided ids', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as StynxPgClient;

    const ids = await seedLgpdFixture(client, {
      tenantId: 'tenant-1',
      actorId: 'actor-1',
    });

    expect(ids).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'actor-1',
        subjectUserId: expect.any(String),
        liveSubjectId: expect.any(String),
        archivedSubjectId: expect.any(String),
        liveAttachmentId: expect.any(String),
        archivedAttachmentId: expect.any(String),
      }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenants'),
      ['tenant-1', 'lgpd-tenant-1'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from privacy_fixture.attachments'),
      [ids.archivedAttachmentId],
    );
    expect(client.query).toHaveBeenCalledTimes(13);
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('insert into auth.users'),
      [ids.subjectUserId, 'actor-1'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('insert into core.pii_map'),
    );
    expect(client.query).toHaveBeenNthCalledWith(
      4,
      `select set_config('app.tenant_id', $1, false)`,
      ['tenant-1'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      5,
      `select set_config('app.actor_id', $1, false)`,
      ['actor-1'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('insert into privacy_fixture.subjects'),
      [ids.liveSubjectId, 'tenant-1', ids.subjectUserId, ids.archivedSubjectId],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining('insert into privacy_fixture.attachments'),
      [ids.liveAttachmentId, 'tenant-1', ids.subjectUserId, ids.archivedAttachmentId],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      8,
      `select set_config('app.archive_move', 'in_progress', false)`,
    );
    expect(client.query).toHaveBeenNthCalledWith(
      9,
      `select set_config('app.archive_reason', 'soft_delete', false)`,
    );
    expect(client.query).toHaveBeenNthCalledWith(
      10,
      expect.stringContaining('insert into archive.privacy_fixture_subjects'),
      ['actor-1', ids.archivedSubjectId],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      11,
      `delete from privacy_fixture.subjects where id = $1::uuid`,
      [ids.archivedSubjectId],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      12,
      expect.stringContaining('insert into archive.privacy_fixture_attachments'),
      ['actor-1', ids.archivedAttachmentId],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      13,
      `delete from privacy_fixture.attachments where id = $1::uuid`,
      [ids.archivedAttachmentId],
    );
  });

  it('generates tenant and actor ids when no input is provided', async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as StynxPgClient;

    const ids = await seedLgpdFixture(client);

    expect(ids).toEqual({
      tenantId: expect.any(String),
      actorId: expect.any(String),
      subjectUserId: expect.any(String),
      liveSubjectId: expect.any(String),
      archivedSubjectId: expect.any(String),
      liveAttachmentId: expect.any(String),
      archivedAttachmentId: expect.any(String),
    });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into tenancy.tenants'),
      [ids.tenantId, `lgpd-${ids.tenantId.slice(0, 8)}`],
    );
  });
});
