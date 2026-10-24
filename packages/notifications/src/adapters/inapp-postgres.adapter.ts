import { insertInboxItem } from '../notifications.repository.js';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import type { ChannelAdapter, ChannelSendInput, ChannelSendResult } from './channel-adapter.js';

/**
 * In-app channel adapter. Persists directly to `notifications.inbox_items` — there is
 * no external provider, so "delivered" means "the row is visible in the recipient's
 * inbox" (see `InboxService`), not a push/read receipt.
 */
@Injectable()
export class InAppPostgresChannelAdapter implements ChannelAdapter {
  readonly channel = 'inapp' as const;

  constructor(private readonly moduleRef: ModuleRef) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const database = this.requireDatabase();
    const id = randomUUID();
    await database.tx(async (trx) => {
      await trx.run(insertInboxItem,
        [
          id,
          input.tenantId,
          input.recipient.subjectId,
          input.notificationId,
          input.deliveryId,
          input.subject ?? '',
          input.body,
          input.locale,
        ],
      );
    });
    return { status: 'DELIVERED' };
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to InAppPostgresChannelAdapter');
    }
    return database;
  }
}
