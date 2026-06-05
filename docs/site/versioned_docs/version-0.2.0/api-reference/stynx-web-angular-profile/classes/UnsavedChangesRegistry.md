[**@stynx-web/angular-profile**](../index.md)

---

[@stynx-web/angular-profile](../index.md) / UnsavedChangesRegistry

# Class: UnsavedChangesRegistry

Defined in: [unsaved-changes.guard.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/unsaved-changes.guard.ts#L12)

## Constructors

### Constructor

> **new UnsavedChangesRegistry**(): `UnsavedChangesRegistry`

#### Returns

`UnsavedChangesRegistry`

## Methods

### hasUnsavedChanges()

> **hasUnsavedChanges**(): `boolean`

Defined in: [unsaved-changes.guard.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/unsaved-changes.guard.ts#L25)

#### Returns

`boolean`

---

### register()

> **register**(`entry`): () => `void`

Defined in: [unsaved-changes.guard.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/unsaved-changes.guard.ts#L17)

#### Parameters

##### entry

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md)

#### Returns

() => `void`
