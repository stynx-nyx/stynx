import { type DynamicModule, Module } from '@nestjs/common';
import { StynxDataModule } from '@stynx-nyx/data';
import { InMemoryPreferencesStore } from './in-memory-preferences.store';
import { PostgresPreferencesStore } from './postgres-preferences.store';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';
import {
  STYNX_PREFERENCES_AUDIT,
  STYNX_PREFERENCES_AVATAR,
  STYNX_PREFERENCES_OPTIONS,
  STYNX_PREFERENCES_STORE,
} from './tokens';
import type {
  PreferencesAuditSink,
  PreferencesAvatarResolver,
  StynxPreferencesModuleOptions,
} from './types';
const noopAudit: PreferencesAuditSink = { write: () => undefined };
const noopAvatar: PreferencesAvatarResolver = { resolve: async () => null };
@Module({})
export class StynxPreferencesModule {
  static forRoot(options: StynxPreferencesModuleOptions = {}): DynamicModule {
    return {
      module: StynxPreferencesModule,
      imports: [StynxDataModule],
      controllers: [PreferencesController],
      providers: [
        { provide: STYNX_PREFERENCES_OPTIONS, useValue: options },
        ...(options.store
          ? [{ provide: STYNX_PREFERENCES_STORE, useValue: options.store }]
          : [
              PostgresPreferencesStore,
              { provide: STYNX_PREFERENCES_STORE, useExisting: PostgresPreferencesStore },
            ]),
        { provide: STYNX_PREFERENCES_AUDIT, useValue: options.audit ?? noopAudit },
        { provide: STYNX_PREFERENCES_AVATAR, useValue: options.avatarResolver ?? noopAvatar },
        PreferencesService,
      ],
      exports: [PreferencesService, STYNX_PREFERENCES_STORE],
    };
  }
  static inMemory(options: Omit<StynxPreferencesModuleOptions, 'store'> = {}): DynamicModule {
    return this.forRoot({ ...options, store: new InMemoryPreferencesStore() });
  }
}
