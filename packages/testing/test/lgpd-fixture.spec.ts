import { lgpdFixturePiiMapYaml, seedLgpdFixture } from '../src/lgpd-fixture';
import type { StynxPgClient } from '@stynx/data';

describe('LGPD fixture helpers', () => {
  it('emits a PII map with every fixture strategy', () => {
    const yaml = lgpdFixturePiiMapYaml();

    expect(yaml).toContain('strategy: nullify');
    expect(yaml).toContain('strategy: hash_with_salt');
    expect(yaml).toContain('strategy: tombstone');
    expect(yaml).toContain('strategy: delete_row');
    expect(yaml).toContain('target: archive');
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
