import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PreferencesService } from '@stynx-nyx/preferences';
import type { NotificationDeliveryPreferences } from '@stynx-nyx/preferences';

/**
 * Narrow read port over a subject's channel opt-in state.
 *
 * `@stynx-nyx/notifications` depends on `@stynx-nyx/preferences` for the
 * `NotificationDeliveryPreferences` *type* (owns email/push/inApp booleans; see
 * ADR-PREFERENCES-0001) rather than redefining it, per the platform decision that a
 * capability package consumes an existing contract instead of forking it. The runtime
 * dependency is expressed through this port, not a hard call into `PreferencesService`,
 * so tests and adopters without the preferences module wired can supply a fake.
 *
 * Known gap: `NotificationDeliveryPreferences` has no `sms` field today. SMS is
 * suppressed only by explicit per-notification `channels` selection or a hard
 * provider-side failure, never by subject preference. See
 * `docs/framework/contracts/notifications-api.md#known-gaps`.
 */
export interface NotificationPreferencesPort {
  read(tenantId: string, subjectId: string): Promise<NotificationDeliveryPreferences>;
}

const OPEN_DEFAULTS: NotificationDeliveryPreferences = { email: true, push: true, inApp: true };

/** Default adapter: wraps `PreferencesService` when it is present in the module graph. */
@Injectable()
export class PreferencesServicePreferencesPort implements NotificationPreferencesPort {
  constructor(private readonly moduleRef: ModuleRef) {}

  async read(tenantId: string, subjectId: string): Promise<NotificationDeliveryPreferences> {
    const preferences = this.moduleRef.get(PreferencesService, { strict: false });
    if (!preferences) {
      return OPEN_DEFAULTS;
    }
    const document = await preferences.getPreferences({ tenantId, subjectId });
    return document.values.notificationDelivery;
  }
}
