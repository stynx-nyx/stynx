import type { LocalePreferences, ThemePreferences, AccessibilityPreferences, NotificationDeliveryPreferences, PreferenceValues, StynxPreferences, StynxProfile } from './types';

/** Complete declared-field guards; returned values retain identity and unknown extensions. */
export type Guard<T> = (value: unknown) => value is T;
type Shape<T> = { [K in keyof T]-?: Guard<T[K]> };

export const string: Guard<string> = (value): value is string => typeof value === 'string';
export const number: Guard<number> = (value): value is number => typeof value === 'number';
export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
export const opaque: Guard<unknown> = (_value): _value is unknown => true;
export const record: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const nullValue: Guard<null> = (value): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    // Visit empty slots too; every() skips them and cannot establish T[].
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (!guard(item)) return false;
    }
    return true;
  };
}
export function union<A, B>(left: Guard<A>, right: Guard<B>): Guard<A | B> {
  return (value): value is A | B => left(value) || right(value);
}
export function literals<const T extends string>(...values: readonly T[]): Guard<T> {
  return (value): value is T => values.some((candidate) => candidate === value);
}
export function object<T extends object>(shape: Shape<T>): Guard<T> {
  return (value): value is T => {
    if (!record(value)) return false;
    for (const key in shape) {
      if (!shape[key](value[key])) return false;
    }
    return true;
  };
}
export function decode<T>(guard: Guard<T>, name: string): (value: unknown) => T {
  return (value) => {
    if (!guard(value)) throw new TypeError(`Invalid ${name} response`);
    return value;
  };
}

export function isLocalePreferences(value: unknown): value is LocalePreferences {
  return object<LocalePreferences>({
    locale: string,
    timezone: string,
  })(value);
}

export function isThemePreferences(value: unknown): value is ThemePreferences {
  return object<ThemePreferences>({
    colorScheme: literals('system', 'light', 'dark'),
    contrast: literals('standard', 'more'),
    density: literals('comfortable', 'compact'),
  })(value);
}

export function isAccessibilityPreferences(value: unknown): value is AccessibilityPreferences {
  return object<AccessibilityPreferences>({
    reduceMotion: boolean,
    largeText: boolean,
    screenReaderOptimized: boolean,
  })(value);
}

export function isNotificationDeliveryPreferences(value: unknown): value is NotificationDeliveryPreferences {
  return object<NotificationDeliveryPreferences>({
    email: boolean,
    push: boolean,
    inApp: boolean,
  })(value);
}

export function isPreferenceValues(value: unknown): value is PreferenceValues {
  return object<PreferenceValues>({
    locale: isLocalePreferences,
    theme: isThemePreferences,
    accessibility: isAccessibilityPreferences,
    notificationDelivery: isNotificationDeliveryPreferences,
  })(value);
}

export function isStynxPreferences(value: unknown): value is StynxPreferences {
  return object<StynxPreferences>({
    values: isPreferenceValues,
    revision: number,
    updatedAt: nullable(string),
  })(value);
}

export function isStynxProfile(value: unknown): value is StynxProfile {
  return object<StynxProfile>({
    subjectId: string,
    displayName: nullable(string),
    avatarUrl: nullable(string),
    avatarDocumentId: nullable(string),
    preferences: isStynxPreferences,
    revision: number,
    updatedAt: nullable(string),
  })(value);
}

