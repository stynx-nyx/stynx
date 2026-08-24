import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { StynxDataModule } from '@stynx-nyx/data';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e008a1';

describe('notifications database integration', () => {
  let postgres: PostgresTestDatabase | undefined;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_notifications');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('@stynx-nyx/notifications:owner') },
            app: { connectionString: postgres.connectionString('@stynx-nyx/notifications:app') },
            reader: { connectionString: postgres.connectionString('@stynx-nyx/notifications:reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1::uuid, 'tenant-notifications', 'Tenant Notifications', true, clock_timestamp(), clock_timestamp())`,
        [tenantId],
      );
    } finally {
      await admin.end();
    }
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();
    await postgres?.dispose();
  }, 60_000);

  it('allows stynx_app to write and stynx_reader to read tenant-scoped inbox rows', async () => {
    const notificationId = randomUUID();
    const deliveryId = randomUUID();
    const inboxId = randomUUID();
    const app = await postgres!.connectAsAdmin();
    try {
      // Drop the provisioning superuser identity, matching production application pools.
      await app.query('set session authorization stynx_app');
      await app.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
      await app.query(
        `insert into notifications.notifications
           (id, tenant_id, recipient_subject_id, category, template_id, template_version, locale, requested_channels)
         values ($1::uuid, $2::uuid, 'subject-1', 'deadline', 'deadline.notice', 1, 'pt-BR', array['inapp'])`,
        [notificationId, tenantId],
      );
      await app.query(
        `insert into notifications.deliveries (id, tenant_id, notification_id, channel, status)
         values ($1::uuid, $2::uuid, $3::uuid, 'inapp', 'QUEUED')`,
        [deliveryId, tenantId, notificationId],
      );
      await app.query(
        `insert into notifications.inbox_items
           (id, tenant_id, recipient_subject_id, notification_id, delivery_id, title, body, locale)
         values ($1::uuid, $2::uuid, 'subject-1', $3::uuid, $4::uuid, 'Deadline', 'A deadline is due.', 'pt-BR')`,
        [inboxId, tenantId, notificationId, deliveryId],
      );
    } finally {
      await app.end();
    }

    const reader = await postgres!.connectAsAdmin();
    try {
      // This is a non-superuser reader session, not a privileged seed connection.
      await reader.query('set session authorization stynx_reader');
      await reader.query(`select set_config('app.tenant_id', $1, false)`, [tenantId]);
      const result = await reader.query<{ id: string }>(
        'select id from notifications.inbox_items where id = $1::uuid',
        [inboxId],
      );
      expect(result.rows).toEqual([{ id: inboxId }]);
    } finally {
      await reader.end();
    }
  });
});
