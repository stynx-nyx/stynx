import { describe, expect, it } from 'vitest';
import { preferencePatchSchema } from '../src/schema.js';

const leaves = [
  ['locale', 'locale', 'pt-BR', false],
  ['locale', 'timezone', 'UTC', 1],
  ['theme', 'colorScheme', 'dark', 'invalid'],
  ['theme', 'contrast', 'more', 'invalid'],
  ['theme', 'density', 'compact', 'invalid'],
  ['accessibility', 'reduceMotion', true, 'true'],
  ['accessibility', 'largeText', true, 1],
  ['accessibility', 'screenReaderOptimized', true, []],
  ['notificationDelivery', 'email', false, 'false'],
  ['notificationDelivery', 'push', false, 0],
  ['notificationDelivery', 'inApp', false, {}],
] as const;

describe('preferences patch schema preservation', () => {
  it.each(leaves)('preserves %s.%s value/null/own-undefined and rejects its wrong representation', (category, field, value, wrong) => {
    for (const item of [value, null, undefined]) {
      const input = { [category]: { [field]: item } };
      expect(preferencePatchSchema.parse(input)).toStrictEqual(input);
    }
    const invalid = preferencePatchSchema.safeParse({ [category]: { [field]: wrong } });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.path)).toEqual([[category, field]]);
  });
  it.each(['locale', 'theme', 'accessibility', 'notificationDelivery'])('preserves optional/null/empty category %s without adding defaults', (category) => {
    for (const value of [undefined, null, {}]) {
      const input = { [category]: value };
      expect(preferencePatchSchema.parse(input)).toStrictEqual(input);
    }
  });
  it('retains schema field issue order before category and root unknown-key errors', () => {
    const result = preferencePatchSchema.safeParse({
      extra: true,
      notificationDelivery: { extra: 1, inApp: 1, push: 1, email: 1 },
      locale: { extra: 1, timezone: false, locale: false },
      theme: { density: 1, contrast: 1, colorScheme: 1 },
      accessibility: { screenReaderOptimized: 1, largeText: 1, reduceMotion: 1 },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: ['locale', 'locale'], code: 'invalid_type' },
      { path: ['locale', 'timezone'], code: 'invalid_type' },
      { path: ['locale'], code: 'unrecognized_keys' },
      { path: ['theme', 'colorScheme'], code: 'invalid_value' },
      { path: ['theme', 'contrast'], code: 'invalid_value' },
      { path: ['theme', 'density'], code: 'invalid_value' },
      { path: ['accessibility', 'reduceMotion'], code: 'invalid_type' },
      { path: ['accessibility', 'largeText'], code: 'invalid_type' },
      { path: ['accessibility', 'screenReaderOptimized'], code: 'invalid_type' },
      { path: ['notificationDelivery', 'email'], code: 'invalid_type' },
      { path: ['notificationDelivery', 'push'], code: 'invalid_type' },
      { path: ['notificationDelivery', 'inApp'], code: 'invalid_type' },
      { path: ['notificationDelivery'], code: 'unrecognized_keys' },
      { path: [], code: 'unrecognized_keys' },
    ]);
  });
});
