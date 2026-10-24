import { insertNotification, insertDelivery, notificationByCorrelation, notificationDeliveries } from './notifications.repository.js';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { NotificationValidationError } from './errors.js';
import { NotificationTemplateRegistry } from './templates/registry.js';
import { notifyRequestSchema } from './schema.js';
import {
  STYNX_NOTIFICATIONS_PREFERENCES_PORT,
  STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY,
} from './tokens.js';
import type { NotificationPreferencesPort } from './preferences/preferences.port.js';
import type {
  DeliveryStatus,
  NotificationChannel,
  NotifyRequest,
  NotifyResult,
} from './types.js';

/** Channels gated by @stynx-nyx/preferences.NotificationDeliveryPreferences. SMS is not (see the port doc). */
const PREFERENCE_GATED_CHANNELS: Partial<
  Record<NotificationChannel, 'email' | 'push' | 'inApp'>
> = {
  email: 'email',
  push: 'push',
  inapp: 'inApp',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly requestContext: RequestContext,
    @Inject(STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY)
    private readonly templates: NotificationTemplateRegistry,
    @Inject(STYNX_NOTIFICATIONS_PREFERENCES_PORT)
    private readonly preferencesPort: NotificationPreferencesPort,
  ) {}

  /**
   * Records a notification and one QUEUED (or preference-SUPPRESSED) delivery row per
   * requested channel, inside the caller's tenant transaction. Sending itself happens
   * later, in `NotificationDispatchService.dispatchDue()` — enqueue never calls a
   * channel provider directly, so it stays fast and safely retryable by the caller.
   */
  async enqueue(rawRequest: NotifyRequest): Promise<NotifyResult> {
    const parsed = notifyRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      throw new NotificationValidationError('Invalid notification request', {
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
    }
    const request = parsed.data;
    const tenantId = this.requireTenantId();
    const actorId = this.requestContext.actorId;

    const template = this.templates.resolve(request.templateId, request.templateVersion);
    const requestedChannels = request.channels ?? [...template.supportedChannels];
    const unsupported = requestedChannels.filter(
      (ch) => !template.supportedChannels.includes(ch),
    );
    if (unsupported.length > 0) {
      throw new NotificationValidationError('Template does not support the requested channel', {
        templateId: template.id,
        unsupported,
      });
    }

    const database = this.requireDatabase();

    if (request.correlationId) {
      const existing = await this.findByCorrelation(database, tenantId, request.correlationId);
      if (existing) {
        return existing;
      }
    }

    const preferences = await this.preferencesPort.read(tenantId, request.recipient.subjectId);

    const notificationId = randomUUID();
    const variables = request.variables ?? {};

    return database.tx(async (trx) => {
      await trx.run(insertNotification,
        [
          notificationId,
          tenantId,
          request.recipient.subjectId,
          request.recipient.email ?? null,
          request.recipient.phone ?? null,
          request.recipient.pushToken ?? null,
          request.category,
          template.id,
          template.version,
          request.locale,
          JSON.stringify(variables),
          requestedChannels,
          request.correlationId ?? null,
          actorId ?? null,
        ],
      );

      const deliveries: NotifyResult['deliveries'] = [];
      for (const ch of requestedChannels) {
        const gate = PREFERENCE_GATED_CHANNELS[ch];
        const suppressed = gate ? preferences[gate] === false : false;
        const deliveryId = randomUUID();
        const status: DeliveryStatus = suppressed ? 'SUPPRESSED' : 'QUEUED';
        await trx.run(insertDelivery,
          [
            deliveryId,
            tenantId,
            notificationId,
            ch,
            status,
            suppressed ? 'preference_opted_out' : null,
          ],
        );
        deliveries.push({ channel: ch, deliveryId, status });
      }

      return { notificationId, deliveries };
    });
  }

  private async findByCorrelation(
    database: Database,
    tenantId: string,
    correlationId: string,
  ): Promise<NotifyResult | undefined> {
    return database.tx(async (trx) => {
      const notification = await trx.run(notificationByCorrelation,
        [tenantId, correlationId],
      );
      const row = notification[0];
      if (!row) {
        return undefined;
      }
      const deliveries = await trx.run(notificationDeliveries,
        [tenantId, row.id],
      );
      return {
        notificationId: row.id,
        deliveries: deliveries.map((delivery) => ({
          channel: delivery.channel,
          deliveryId: delivery.id,
          status: delivery.status,
        })),
      };
    }, { readonly: true });
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to NotificationsService');
    }
    return database;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new NotificationValidationError('Tenant context is required');
    }
    return tenantId;
  }
}
