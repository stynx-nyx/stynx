import { type DynamicModule, Module } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EmailSesChannelAdapter } from './adapters/email-ses.adapter';
import { InAppPostgresChannelAdapter } from './adapters/inapp-postgres.adapter';
import { PushStubChannelAdapter } from './adapters/push-stub.adapter';
import { SmsSnsChannelAdapter } from './adapters/sms-sns.adapter';
import { NotificationDispatchService } from './dispatch.service';
import { NotificationInboxService } from './inbox.service';
import { NotificationsService } from './notifications.service';
import { PreferencesServicePreferencesPort } from './preferences/preferences.port';
import { NotificationTemplateRegistry } from './templates/registry';
import { NotificationTemplateRenderer } from './templates/render';
import { STYNX_NOTIFICATIONS_CHANNEL_ADAPTERS, STYNX_NOTIFICATIONS_OPTIONS, STYNX_NOTIFICATIONS_PREFERENCES_PORT, STYNX_NOTIFICATIONS_TEMPLATE_REGISTRY } from './tokens';
import type { NotificationChannel, StynxNotificationsModuleOptions } from './types';

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
            const adapters = new Map<NotificationChannel, import('./adapters/channel-adapter').ChannelAdapter>();
            if (options.ses) adapters.set('email', email);
            if (options.sns) adapters.set('sms', sms);
            adapters.set('push', push); adapters.set('inapp', inapp);
            for (const [channel, adapter] of Object.entries(options.channelAdapters ?? {})) adapters.set(channel as NotificationChannel, adapter!);
            return adapters;
          },
        },
        NotificationTemplateRenderer, NotificationsService, NotificationDispatchService, NotificationInboxService,
      ],
      exports: [NotificationsService, NotificationDispatchService, NotificationInboxService, NotificationTemplateRegistry, STYNX_NOTIFICATIONS_PREFERENCES_PORT],
    };
  }
}
