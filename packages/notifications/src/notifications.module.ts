import { type DynamicModule, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EmailSesChannelAdapter } from './adapters/email-ses.adapter.js';
import { InAppPostgresChannelAdapter } from './adapters/inapp-postgres.adapter.js';
import { PushStubChannelAdapter } from './adapters/push-stub.adapter.js';
import { SmsSnsChannelAdapter } from './adapters/sms-sns.adapter.js';
import { NotificationDispatchService } from './dispatch.service.js';
import { NotificationInboxService } from './inbox.service.js';
import { NotificationsService } from './notifications.service.js';
import { PreferencesServicePreferencesPort } from './preferences/preferences.port.js';
import { NotificationTemplateRegistry } from './templates/registry.js';
import { NotificationTemplateRenderer } from './templates/render.js';
import { STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS, STYNX_NOTIFICATIONS_OPTIONS, STYNX_NOTIFICATIONS_PREFERENCES_PORT, STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY } from './tokens.js';
import type { StynxNotificationsModuleOptions } from './types.js';

@Module({})
export class StynxNotificationsModule {
  static forRoot(options: StynxNotificationsModuleOptions = {}): DynamicModule {
    return {
      module: StynxNotificationsModule,
      global: true,
      providers: [
        { provide: STYNX_NOTIFICATIONS_OPTIONS, useValue: options },
        NotificationTemplateRegistry,
        { provide: STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY, useExisting: NotificationTemplateRegistry },
        PreferencesServicePreferencesPort,
        {
          provide: STYNX_NOTIFICATIONS_PREFERENCES_PORT,
          inject: [ModuleRef],
          useFactory: (moduleRef: ModuleRef) => options.preferencesPort ?? new PreferencesServicePreferencesPort(moduleRef),
        },
        EmailSesChannelAdapter, SmsSnsChannelAdapter, PushStubChannelAdapter, InAppPostgresChannelAdapter,
        {
          provide: STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS,
          inject: [EmailSesChannelAdapter, SmsSnsChannelAdapter, PushStubChannelAdapter, InAppPostgresChannelAdapter],
          useFactory: (email: EmailSesChannelAdapter, sms: SmsSnsChannelAdapter, push: PushStubChannelAdapter, inapp: InAppPostgresChannelAdapter) => {
            const adapters = new Map<string, import('./adapters/channel-adapter.js').ChannelAdapter>();
            if (options.ses) adapters.set('email', email);
            if (options.sns) adapters.set('sms', sms);
            adapters.set('push', push); adapters.set('inapp', inapp);
            for (const [channel, adapter] of Object.entries(options.channelAdapters ?? {})) adapters.set(channel, adapter!);
            return adapters;
          },
        },
        NotificationTemplateRenderer, NotificationsService, NotificationDispatchService, NotificationInboxService,
      ],
      exports: [NotificationsService, NotificationDispatchService, NotificationInboxService, NotificationTemplateRegistry, STYNX_NOTIFICATIONS_PREFERENCES_PORT],
    };
  }
}
