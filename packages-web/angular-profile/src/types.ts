export interface StynxProfileValue {
  name: string;
  email: string;
  locale: string;
}

export interface StynxPreferencesValue {
  locale: string;
  notifications: boolean;
}

export interface StynxPreferences extends StynxPreferencesValue {
  timezone?: string;
  [key: string]: unknown;
}

export interface StynxProfile extends StynxProfileValue {
  id?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  timezone?: string;
  avatarUrl?: string | null;
  avatarDocumentId?: string | null;
  preferences?: StynxPreferences;
  [key: string]: unknown;
}

export interface StynxAvatarUploadResult {
  url: string;
}
