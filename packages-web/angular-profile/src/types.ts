export interface StynxProfileValue {
  name: string;
  email: string;
  locale: string;
}
export interface StynxPreferencesValue {
  locale: string;
  notifications: boolean;
}
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
export interface StynxPreferences {
  values: PreferenceValues;
  revision: number;
  updatedAt: string | null;
}
export interface StynxProfile {
  subjectId: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarDocumentId: string | null;
  preferences: StynxPreferences;
  revision: number;
  updatedAt: string | null;
}
export interface StynxProfilePatch {
  displayName?: string | null;
  avatarDocumentId?: string | null;
}
export interface StynxAvatarUploadResult {
  url: string;
}
