// Type-level smoke check: stynx-i18n public types are referenceable.
// Companion to i18n-export.spec.ts.

import type * as I18n from '../../src/index';

describe('@stynx/i18n public types', () => {
  it('module namespace is type-importable', () => {
    const probe: keyof typeof I18n | undefined = undefined;
    expect(probe).toBeUndefined();
  });
});
