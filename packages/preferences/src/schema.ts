import { z } from 'zod';
import type { PreferenceValues } from './types';

const ascii = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[\x20-\x7E]+$/);
export const localePreferencesSchema = z.strictObject({
  locale: ascii(35).min(2),
  timezone: ascii(100),
});
export const themePreferencesSchema = z.strictObject({
  colorScheme: z.enum(['system', 'light', 'dark']),
  contrast: z.enum(['standard', 'more']),
  density: z.enum(['comfortable', 'compact']),
});
export const accessibilityPreferencesSchema = z.strictObject({
  reduceMotion: z.boolean(),
  largeText: z.boolean(),
  screenReaderOptimized: z.boolean(),
});
export const notificationDeliveryPreferencesSchema = z.strictObject({
  email: z.boolean(),
  push: z.boolean(),
  inApp: z.boolean(),
});
export const preferenceValuesSchema = z.strictObject({
  locale: localePreferencesSchema,
  theme: themePreferencesSchema,
  accessibility: accessibilityPreferencesSchema,
  notificationDelivery: notificationDeliveryPreferencesSchema,
});
const nullablePartial = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(
    Object.fromEntries(
      Object.entries(shape).map(([key, value]) => [
        key,
        (value as z.ZodType).nullable().optional(),
      ]),
    ) as unknown as { [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>> },
  );
export const preferencePatchSchema = z
  .strictObject({
    locale: nullablePartial(localePreferencesSchema.shape).nullable().optional(),
    theme: nullablePartial(themePreferencesSchema.shape).nullable().optional(),
    accessibility: nullablePartial(accessibilityPreferencesSchema.shape).nullable().optional(),
    notificationDelivery: nullablePartial(notificationDeliveryPreferencesSchema.shape)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'empty patch');
export const profilePatchSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
    avatarDocumentId: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value) <= 255)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'empty patch');
export const PLATFORM_PREFERENCE_DEFAULTS: PreferenceValues = {
  locale: { locale: 'en-US', timezone: 'UTC' },
  theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
  accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
  notificationDelivery: { email: true, push: true, inApp: true },
};
