export type PreferenceCategory = 'locale' | 'theme' | 'accessibility' | 'notificationDelivery';
export interface LocalePreferences {
  locale: string;
  timezone: string;
}
export interface ThemePreferences {
  colorScheme: 'system' | 'light' | 'dark';
  contrast: 'standard' | 'more';
  density: 'comfortable' | 'compact';
}
export interface AccessibilityPreferences {
  reduceMotion: boolean;
  largeText: boolean;
  screenReaderOptimized: boolean;
}
export interface NotificationDeliveryPreferences {
  email: boolean;
  push: boolean;
  inApp: boolean;
}
export interface PreferenceValues {
  locale: LocalePreferences;
  theme: ThemePreferences;
  accessibility: AccessibilityPreferences;
  notificationDelivery: NotificationDeliveryPreferences;
}
export interface PreferencesDocument {
  values: PreferenceValues;
  revision: number;
  updatedAt: string | null;
}
export interface PlatformProfile {
  subjectId: string;
  displayName: string | null;
  avatarDocumentId: string | null;
  avatarUrl: string | null;
  preferences: PreferencesDocument;
  revision: number;
  updatedAt: string | null;
}
export type TrustedPreferenceScope = Readonly<{ tenantId: string; subjectId: string }>;
export type PreferenceOverrides = { [K in PreferenceCategory]?: Partial<PreferenceValues[K]> };
export interface StoredSubjectPreferences {
  scope: TrustedPreferenceScope;
  displayName: string | null;
  avatarDocumentId: string | null;
  overrides: PreferenceOverrides;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface PreferenceMutation {
  scope: TrustedPreferenceScope;
  expectedRevision: number;
  displayName: string | null;
  avatarDocumentId: string | null;
  overrides: PreferenceOverrides;
}
export interface PreferencesStore {
  read(scope: TrustedPreferenceScope): Promise<StoredSubjectPreferences | null>;
  compareAndSet(input: PreferenceMutation): Promise<StoredSubjectPreferences | 'conflict'>;
}
export interface PreferencesAuditEvent {
  operation:
    | 'preferences.updated'
    | 'preferences.category_reset'
    | 'preferences.reset'
    | 'profile.updated';
  tenantId: string;
  subjectId: string;
  actorId: string;
  requestId: string;
  changedPaths: string[];
  previousRevision: number;
  newRevision: number;
  occurredAt: string;
}
export interface PreferencesAuditSink {
  write(event: PreferencesAuditEvent): Promise<void> | void;
}
export interface PreferencesAvatarResolver {
  resolve(documentId: string | null, scope: TrustedPreferenceScope): Promise<string | null>;
}
export interface StynxPreferencesModuleOptions {
  defaults?: PreferenceValues;
  supportedLocales?: readonly string[];
  supportedTimezones?: readonly string[];
  store?: PreferencesStore;
  audit?: PreferencesAuditSink;
  avatarResolver?: PreferencesAvatarResolver;
  mountController?: boolean;
}
export type PreferencePatch = {
  [K in PreferenceCategory]?:
    | { [P in keyof PreferenceValues[K]]?: PreferenceValues[K][P] | null }
    | null;
};
export interface ProfilePatch {
  displayName?: string | null;
  avatarDocumentId?: string | null;
}
