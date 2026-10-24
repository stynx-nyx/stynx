import { claimDueDeliveries, markClaimedDelivery, persistDeliveryOutcome } from './notifications.repository.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { StynxLogger } from '@stynx-nyx/logging';
import { NotificationTemplateRegistry } from './templates/registry.js';
import { NotificationTemplateRenderer } from './templates/render.js';
import { STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS, STYNX_NOTIFICATIONS_OPTIONS } from './tokens.js';
import type { ChannelAdapter } from './adapters/channel-adapter.js';
import type {
  ChannelRetryPolicy, DeliveryStatus, DispatchDueOptions, DispatchDueResult, DispatchOutcome,
  NotificationChannel, StynxNotificationsModuleOptions,
} from './types.js';

const DEFAULT_RETRY_POLICY: ChannelRetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 3_600_000,
  jitterRatio: 0.2,
};

interface ClaimedDelivery {
  id: string;
  tenant_id: string;
  notification_id: string;
  channel: NotificationChannel;
  attempt_count: number;
  max_attempts: number;
  recipient_subject_id: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_push_token: string | null;
  template_id: string;
  template_version: number;
  locale: string;
  variables: Record<string, unknown>;
}

/**
 * Narrow dispatch port for a future jobs worker. This package owns claiming and state
 * transitions; `@stynx-nyx/jobs` may invoke this port on its schedule but is not a
 * dependency of notifications.
 */
export interface NotificationDispatchPort {
  dispatchDue(options?: DispatchDueOptions): Promise<DispatchDueResult>;
}

@Injectable()
export class NotificationDispatchService implements NotificationDispatchPort {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly templates: NotificationTemplateRegistry,
    private readonly renderer: NotificationTemplateRenderer,
    @Inject(STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS)
    private readonly adapters: ReadonlyMap<NotificationChannel, ChannelAdapter>,
    @Inject(STYNX_NOTIFICATIONS_OPTIONS)
    private readonly options: StynxNotificationsModuleOptions,
    @Optional() private readonly logger?: StynxLogger,
  ) {}

  async dispatchDue(options: DispatchDueOptions = {}): Promise<DispatchDueResult> {
    const database = this.requireDatabase();
    const claimed = await database.tx(async (trx) => {
        const rows = await trx.run(claimDueDeliveries,
          [(options.now ?? new Date()).toISOString(), Math.min(Math.max(options.batchSize ?? 50, 1), 500)],
        );
        for (const row of rows) {
          await trx.run(markClaimedDelivery,
            [row.id, row.tenant_id],
          );
        }
        return rows;
      });

    const outcomes: DispatchOutcome[] = [];
    for (const delivery of claimed) {
      const adapter = this.adapters.get(delivery.channel);
      let result: Awaited<ReturnType<ChannelAdapter['send']>>;
      try {
        if (!adapter) {
          result = { status: 'FAILED', errorCode: 'CHANNEL_ADAPTER_UNAVAILABLE', terminal: true };
        } else {
          const template = this.templates.resolve(delivery.template_id, delivery.template_version);
          const content = this.renderer.render(template, delivery.locale, delivery.variables, delivery.tenant_id);
          result = await adapter.send({
            deliveryId: delivery.id,
            notificationId: delivery.notification_id,
            tenantId: delivery.tenant_id,
            recipient: {
              subjectId: delivery.recipient_subject_id,
              ...(delivery.recipient_email ? { email: delivery.recipient_email } : {}),
              ...(delivery.recipient_phone ? { phone: delivery.recipient_phone } : {}),
              ...(delivery.recipient_push_token ? { pushToken: delivery.recipient_push_token } : {}),
            },
            ...((delivery.channel === 'inapp' ? content.inAppTitle : content.subject) === undefined ? {} : { subject: delivery.channel === 'inapp' ? content.inAppTitle : content.subject }),
            body: content.body,
            locale: delivery.locale,
          });
        }
      } catch (error) {
        result = {
          status: 'FAILED', errorCode: 'CHANNEL_SEND_EXCEPTION',
          errorDetail: error instanceof Error ? error.name : 'unknown_error',
        };
      }
      const status = await this.persistOutcome(delivery, result);
      outcomes.push({ deliveryId: delivery.id, channel: delivery.channel, status });
      this.logOutcome(delivery, status, result.errorCode);
    }
    return { claimed: claimed.length, outcomes };
  }

  private async persistOutcome(
    delivery: ClaimedDelivery,
    result: Awaited<ReturnType<ChannelAdapter['send']>>,
  ): Promise<DeliveryStatus> {
    const policy = this.options.retryPolicies?.[delivery.channel] ?? DEFAULT_RETRY_POLICY;
    const exhausted = delivery.attempt_count + 1 >= Math.max(policy.maxAttempts, 1);
    const finalStatus: DeliveryStatus = result.status === 'FAILED' && !result.terminal && !exhausted
      ? 'QUEUED' : result.status;
    const delay = this.retryDelay(policy, delivery.attempt_count + 1);
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
        await trx.run(persistDeliveryOutcome,
          [delivery.id, delivery.tenant_id, finalStatus, result.providerMessageId ?? null,
            result.errorCode ?? null, result.errorDetail ?? null, result.suppressedReason ?? null, delay],
        );
      });
    return finalStatus;
  }

  private retryDelay(policy: ChannelRetryPolicy, attempt: number): number {
    const uncapped = policy.baseDelayMs * (2 ** Math.max(attempt - 1, 0));
    const capped = Math.min(uncapped, policy.maxDelayMs ?? uncapped);
    const jitter = (policy.jitterRatio ?? 0) * capped;
    return Math.round(capped - jitter + Math.random() * jitter * 2);
  }

  private logOutcome(delivery: ClaimedDelivery, status: DeliveryStatus, errorCode?: string): void {
    // Deliberately IDs/status only: recipients, variables, rendered content and provider detail are PII.
    this.logger?.log('notification delivery state changed', {
      context: `notificationId=${delivery.notification_id} deliveryId=${delivery.id} channel=${delivery.channel} status=${status}${errorCode ? ` errorCode=${errorCode}` : ''}`,
    });
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) throw new Error('Database provider is unavailable to NotificationDispatchService');
    return database;
  }
}
