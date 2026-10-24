import { markInboxRead, listInboxItems } from './notifications.repository.js';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { NotificationValidationError } from './errors.js';
import type { InboxItem, InboxQuery } from './types.js';

@Injectable()
export class NotificationInboxService {
  constructor(private readonly moduleRef: ModuleRef, private readonly requestContext: RequestContext) {}

  async list(query: InboxQuery): Promise<InboxItem[]> {
    const tenantId = this.tenantId();
    const result = await this.database().tx(async (trx) => trx.run(listInboxItems,
      [tenantId, query.subjectId, query.unreadOnly ?? false, Math.min(Math.max(query.limit ?? 50, 1), 200)],
    ), { readonly: true });
    return [...result];
  }

  async markRead(id: string): Promise<void> {
    await this.database().tx(async (trx) => { await trx.run(markInboxRead, [id, this.tenantId()],
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
