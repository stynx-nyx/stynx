import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { NotificationValidationError } from './errors';
import type { InboxItem, InboxQuery } from './types';

@Injectable()
export class NotificationInboxService {
  constructor(private readonly moduleRef: ModuleRef, private readonly requestContext: RequestContext) {}

  async list(query: InboxQuery): Promise<InboxItem[]> {
    const tenantId = this.tenantId();
    const result = await this.database().tx(async (trx) => trx.query<InboxItem>(
      `select id, notification_id as "notificationId", delivery_id as "deliveryId", title, body, locale,
              read_at as "readAt", dismissed_at as "dismissedAt", created_at as "createdAt"
         from notifications.inbox_items
        where tenant_id = $1::uuid and recipient_subject_id = $2
          and ($3::boolean = false or read_at is null)
        order by created_at desc limit $4`,
      [tenantId, query.subjectId, query.unreadOnly ?? false, Math.min(Math.max(query.limit ?? 50, 1), 200)],
    ), { readonly: true });
    return result.rows;
  }

  async markRead(id: string): Promise<void> {
    await this.database().tx(async (trx) => { await trx.query(
      `update notifications.inbox_items set read_at = coalesce(read_at, clock_timestamp())
        where id = $1::uuid and tenant_id = $2::uuid`, [id, this.tenantId()],
    ); });
  }

  private tenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) throw new NotificationValidationError('Tenant context is required');
    return tenantId;
  }
  private database(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) throw new Error('Database provider is unavailable to NotificationInboxService');
    return database;
  }
}
